#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

eh_directory=/opt/email-host
eh_download_origin=https://emailhost.olegsan.tech
eh_release=
eh_mode=
eh_requested_mode=
eh_app_domain=
eh_convex_domain=
eh_site_domain=
eh_download_directory=
eh_log=
eh_existing=0

eh_error() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
eh_note() { printf '%s\n' "$*" >&2; }

eh_valid_domain() {
  local domain=$1 label
  [[ ${#domain} -le 253 && $domain == *.* && $domain != *[!a-z0-9.-]* ]] || return 1
  [[ $domain != .* && $domain != *. && $domain != *..* ]] || return 1
  local -a labels
  IFS=. read -r -a labels <<< "$domain"
  for label in "${labels[@]}"; do
    [[ ${#label} -le 63 && $label =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || return 1
  done
  [[ ${labels[${#labels[@]}-1]} =~ ^[a-z]{2,63}$ || ${labels[${#labels[@]}-1]} =~ ^xn--[a-z0-9-]+$ ]]
}

eh_valid_version() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9][A-Za-z0-9.-]*)?$ ]]; }
eh_valid_proxy_name() { [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; }

eh_help() {
  cat <<'HELP'
Email Host: установка готовых Docker-образов.

  sudo bash install.sh [--release 0.1.0] [--directory /opt/email-host]
  curl -fsSL https://emailhost.olegsan.tech/install/service | sudo bash

Мастер предложит вариант размещения и три домена. Подготовьте DNS A/AAAA,
направленные на этот сервер. Не создавайте AAAA, если IPv6 не настроен.
Standalone получает собственный HTTPS proxy. Traefik использует существующий
Docker proxy. Nginx создаёт отдельный конфиг для подключения администратором.
Установщик не обновляет существующий инстанс и не меняет чужие proxy-конфиги.
Первый вход owner@ваш-домен не требует существующего почтового ящика.
Секреты сохраняются в закрытом credentials.txt, а не в выводе установщика.

--release VERSION   Использовать конкретный выпуск с сайта проекта.
--mode MODE         standalone, traefik или nginx. Не меняет режим существующего инстанса.
--directory PATH    Отдельный закрытый каталог установки.
--help              Показать эту справку без изменений системы.
HELP
}

eh_parse_arguments() {
  while (( $# )); do
    case $1 in
      --release)
        [[ $# -ge 2 ]] || eh_error 'После --release нужна версия.'
        eh_release=${2#v}; eh_valid_version "$eh_release" || eh_error 'Неверный формат версии.'
        shift 2 ;;
      --directory)
        [[ $# -ge 2 ]] || eh_error 'После --directory нужен абсолютный путь.'
        eh_directory=$2
        [[ $eh_directory == /* && $eh_directory != / && $eh_directory != *[!A-Za-z0-9_./-]* && $eh_directory != *..* ]] || eh_error 'Нужен отдельный абсолютный путь без пробелов и .. .'
        shift 2 ;;
      --mode)
        [[ $# -ge 2 ]] || eh_error 'После --mode нужен standalone, traefik или nginx.'
        case $2 in standalone|traefik|nginx) ;; *) eh_error 'Неизвестный режим установки.' ;; esac
        eh_requested_mode=$2; eh_mode=$2; shift 2 ;;
      --help|-h) eh_help; exit 0 ;;
      *) eh_error "Неизвестный аргумент: $1"; return 1 ;;
    esac
  done
}

eh_read() {
  local prompt=$1 default=${2:-} answer
  if [[ -n $default ]]; then printf '%s [%s]: ' "$prompt" "$default" >&2; else printf '%s: ' "$prompt" >&2; fi
  IFS= read -r answer <&3 || { eh_error 'Ввод прерван. Уже созданные настройки сохранены.'; return 1; }
  printf '%s' "${answer:-$default}"
}

eh_read_domain() {
  local answer
  while :; do
    answer=$(eh_read "$1" "${2:-}") || return 1
    answer=$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')
    if eh_valid_domain "$answer"; then printf '%s' "$answer"; return; fi
    eh_note 'Введите DNS-имя, например mail.example.com. Без https://, пути, порта или wildcard.'
  done
}

eh_env_value() {
  # Read known configuration as data. Never execute the secrets file as shell code.
  local file=$1 key=$2 value
  value=$(sed -n "s/^${key}=//p" "$file")
  [[ $value != *$'\n'* ]] || { eh_error "Повторяющаяся переменная $key в конфигурации."; return 1; }
  if [[ $value == \"*\" || $value == \'*\' ]]; then value=${value:1:${#value}-2}; fi
  printf '%s' "$value"
}

eh_cleanup() {
  if [[ -n $eh_download_directory && $eh_download_directory == /tmp/email-host-install.* ]]; then
    rm -rf -- "$eh_download_directory"
  fi
}

eh_secure_install_path() {
  local current=$eh_directory mode
  while [[ $current != / ]]; do
    [[ ! -L $current ]] || eh_error 'Каталог установки и его родители не должны быть символическими ссылками.'
    if [[ -e $current ]]; then
      [[ -d $current && $(stat -c %u "$current") == 0 ]] || eh_error 'Каталоги установки и её родители должны принадлежать root.'
      mode=$(stat -c %a "$current")
      (( (8#$mode & 022) == 0 )) || eh_error 'Родители каталога установки не должны разрешать запись группе или другим пользователям.'
    fi
    current=$(dirname "$current")
  done
}

eh_check_state_files() {
  local name file
  for name in .env credentials.txt installation.conf installation.mode .email-host-install .email-host-install.pending proxy.env install.log .admin-key.pending .functions-ready .verified; do
    file="$eh_directory/$name"
    [[ ! -L $file ]] || eh_error "Ссылка вместо $name запрещена."
    if [[ -e $file ]]; then
      [[ -f $file && $(stat -c %u "$file") == 0 && $(stat -c %a "$file") == 600 ]] || eh_error "Файл $name должен быть обычным, принадлежать root и иметь права 0600."
    fi
  done
}

eh_preflight() {
  [[ $(uname -s) == Linux ]] || eh_error 'Установщик предназначен для Linux-сервера. На этой системе изменений не выполнено.'
  [[ ${EUID:-$(id -u)} -eq 0 ]] || eh_error 'Запустите установщик через sudo bash.'
  case $(uname -m) in x86_64|aarch64|arm64) ;; *) eh_error 'Поддерживаются Linux amd64 и arm64.' ;; esac
  command -v curl >/dev/null || eh_error 'Установите curl и запустите мастер снова.'
  command -v tar >/dev/null || eh_error 'Установите tar и запустите мастер снова.'
  command -v sha256sum >/dev/null || eh_error 'Установите coreutils с sha256sum.'
  command -v flock >/dev/null || eh_error 'Установите util-linux с flock для защиты от одновременного запуска.'
  if ! { exec 3<>/dev/tty; } 2>/dev/null; then
    eh_error 'Нужен интерактивный терминал. Скачайте install.sh в файл и запустите sudo bash install.sh через SSH.'
  fi
  eh_secure_install_path
  if [[ -d $eh_directory ]]; then
    [[ $(stat -c %u "$eh_directory") == 0 ]] || eh_error 'Существующий каталог установки не принадлежит root.'
    if [[ -f $eh_directory/.email-host-install ]]; then
      [[ $(stat -c %a "$eh_directory") == 700 ]] || eh_error 'Существующий каталог Email Host должен иметь права 0700.'
      eh_check_state_files
      [[ $(cat "$eh_directory/.email-host-install") == 'Email Host public installer' ]] || eh_error 'Неизвестный маркер установки.'
      if [[ ! -f $eh_directory/installation.conf || ! -f $eh_directory/installation.mode ]]; then
        [[ ! -e $eh_directory/.env && ! -e $eh_directory/credentials.txt ]] || eh_error 'Неполное состояние установки с существующими секретами требует ручной проверки.'
        eh_note 'Предыдущая загрузка прервана до создания ключей. Мастер заново проверит и подготовит файлы.'
        return
      fi
      if [[ ! -e $eh_directory/.env && ! -e $eh_directory/credentials.txt ]]; then
        local saved_mode saved_version
        saved_mode=$(cat "$eh_directory/installation.mode")
        saved_version=$(eh_env_value "$eh_directory/installation.conf" EMAIL_HOST_VERSION)
        if [[ $saved_mode != standalone && $saved_mode != traefik && $saved_mode != nginx ]] || ! eh_valid_version "$saved_version"; then
          eh_note 'Начальная подготовка метаданных прервана до создания ключей. Мастер подготовит её повторно.'
          return
        fi
      fi
      eh_existing=1
      [[ ! -L $eh_directory/.env && ! -L $eh_directory/.email-host-install && ! -L $eh_directory/installation.conf ]] || eh_error 'Ссылки вместо файлов конфигурации запрещены.'
      [[ $(stat -c %a "$eh_directory/installation.conf") == 600 && $(stat -c %u "$eh_directory/installation.conf") == 0 ]] || eh_error 'Файл installation.conf должен принадлежать root и иметь права 0600.'
      if [[ -f $eh_directory/.env ]]; then
        [[ $(stat -c %a "$eh_directory/.env") == 600 && $(stat -c %u "$eh_directory/.env") == 0 ]] || eh_error 'Файл .env должен принадлежать root и иметь права 0600.'
      fi
    elif [[ -f $eh_directory/.email-host-install.pending ]]; then
      [[ $(stat -c %a "$eh_directory") == 700 ]] || eh_error 'Незавершённый каталог установки должен иметь права 0700.'
      eh_check_state_files
      local pending_text
      pending_text=$(cat "$eh_directory/.email-host-install.pending")
      [[ 'Email Host public installer' == "$pending_text"* && -z $(find "$eh_directory" -mindepth 1 -maxdepth 1 ! -name .email-host-install.pending -print -quit) ]] || eh_error 'Нераспознанный незавершённый каталог. Файлы не изменены.'
      eh_note 'Создание маркера загрузки было прервано. В каталоге ещё нет конфигурации или данных, подготовка продолжится.'
    elif [[ -n $(find "$eh_directory" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
      eh_error 'Каталог не пуст и не содержит распознанную установку Email Host. Выберите другой --directory. Файлы не изменены.'
    fi
  elif [[ -e $eh_directory ]]; then
    eh_error 'Путь установки уже занят файлом.'
  fi
}

eh_acquire_lock() {
  local lock=/run/email-host-install.lock
  [[ ! -L $lock ]] || eh_error 'Небезопасный файл блокировки установки.'
  if [[ -e $lock ]]; then
    [[ -f $lock && $(stat -c %u "$lock") == 0 ]] || eh_error 'Файл блокировки не является обычным файлом root.'
  fi
  exec 9>> "$lock"
  flock -n 9 || eh_error 'Другой мастер Email Host уже выполняется. Дождитесь его завершения. Файл блокировки удалять не нужно.'
}

eh_choose_configuration() {
  if (( eh_existing )); then
    local saved_release saved_config="$eh_directory/installation.conf"
    [[ ! -f $eh_directory/.env ]] || saved_config="$eh_directory/.env"
    saved_release=$(eh_env_value "$saved_config" EMAIL_HOST_VERSION)
    eh_valid_version "$saved_release" || eh_error 'В сохранённой конфигурации некорректная версия.'
    [[ -z $eh_release || $eh_release == "$saved_release" ]] || eh_error 'Установщик не меняет версию существующего инстанса. Используйте отдельную процедуру обновления.'
    eh_release=$saved_release
    eh_mode=$(cat "$eh_directory/installation.mode")
    [[ -z $eh_requested_mode || $eh_requested_mode == "$eh_mode" ]] || eh_error 'Нельзя менять режим существующего инстанса через --mode.'
    eh_app_domain=$(eh_env_value "$saved_config" APP_DOMAIN)
    eh_convex_domain=$(eh_env_value "$saved_config" CONVEX_DOMAIN)
    eh_site_domain=$(eh_env_value "$saved_config" CONVEX_SITE_DOMAIN)
    eh_valid_domain "$eh_app_domain" && eh_valid_domain "$eh_convex_domain" && eh_valid_domain "$eh_site_domain" || eh_error 'Сохранённые домены некорректны. Файлы не изменены.'
    eh_note 'Найдена существующая установка. Домены, версия и секреты будут сохранены.'
  else
    if [[ -z $eh_mode ]]; then
    eh_note 'Где устанавливаем Email Host?'
    eh_note '  1. Пустой сервер, отдельный HTTPS proxy на портах 80 и 443.'
    eh_note '  2. Сервер с уже работающим Docker Traefik.'
    eh_note '  3. Сервер с Nginx, отдельный конфиг для подключения администратором.'
    local answer
    while :; do
      answer=$(eh_read 'Вариант' 1)
      case $answer in 1) eh_mode=standalone; break ;; 2) eh_mode=traefik; break ;; 3) eh_mode=nginx; break ;; *) eh_note 'Выберите 1, 2 или 3.' ;; esac
    done
    fi
    eh_app_domain=$(eh_read_domain 'Домен приложения')
    eh_convex_domain=$(eh_read_domain 'Домен Convex' "convex.$eh_app_domain")
    eh_site_domain=$(eh_read_domain 'Домен HTTP actions' "convex-site.$eh_app_domain")
  fi
  case $eh_mode in standalone|traefik|nginx) ;; *) eh_error 'Неизвестный сохранённый режим размещения.' ;; esac
  [[ $eh_app_domain != "$eh_convex_domain" && $eh_app_domain != "$eh_site_domain" && $eh_convex_domain != "$eh_site_domain" ]] || eh_error 'Для трёх сервисов нужны разные домены.'
  eh_note ''
  eh_note "Каталог: $eh_directory. Режим: $eh_mode."
  eh_note "Домены: $eh_app_domain, $eh_convex_domain, $eh_site_domain."
  eh_note 'Будут загружены готовые образы, созданы отдельные volumes и сгенерированы новые секреты только для новой установки.'
  if ! command -v docker >/dev/null; then eh_note 'Docker отсутствует. На Ubuntu/Debian будет добавлен официальный apt-репозиторий Docker и установлены Docker Engine и Compose.'; fi
  if [[ $eh_mode == nginx ]]; then eh_note 'Конфиги Nginx не будут изменены автоматически. Мастер сохранит конфиг и точные действия для подключения HTTPS.'; fi
  [[ $(eh_read 'Продолжить? Введите yes' no) == yes ]] || { eh_note 'Установка отменена до изменения системы.'; exit 0; }
}

eh_https_download() {
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 180 --retry 2 --max-filesize 33554432 "$1" --output "$2"
}

eh_validate_archive() {
  local archive=$1 checksum=$2 name line hash entry_count=0
  [[ $(wc -c < "$archive") -le 33554432 ]] || eh_error 'Архив выпуска превышает 32 MiB.'
  line=$(cat "$checksum")
  [[ $line =~ ^([a-fA-F0-9]{64})[[:space:]][[:space:]]email-host-deploy.tar.gz$ ]] || eh_error 'Некорректный внешний SHA256 manifest.'
  hash=${BASH_REMATCH[1]}
  [[ $(sha256sum "$archive" | cut -d' ' -f1) == "$(printf '%s' "$hash" | tr A-F a-f)" ]] || eh_error 'Контрольная сумма архива не совпала. Ничего не установлено.'
  local entries types
  entries=$(tar -tzf "$archive") || return 1
  types=$(tar -tvzf "$archive") || return 1
  [[ -n $entries ]] || eh_error 'Пустой архив.'
  while IFS= read -r line; do [[ $line == -* ]] || { eh_error 'В архиве допустимы только обычные файлы, без каталогов и ссылок.'; return 1; }; done <<< "$types"
  local seen=$'\n'
  while IFS= read -r name; do
    [[ $name =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && $seen != *$'\n'"$name"$'\n'* ]] || { eh_error 'В архиве есть небезопасное или повторяющееся имя файла.'; return 1; }
    seen+="$name"$'\n'; entry_count=$((entry_count + 1))
  done <<< "$entries"
  (( entry_count <= 40 )) || eh_error 'В архиве слишком много файлов.'
  for name in VERSION SHA256SUMS compose.yml compose.standalone.yml compose.traefik.yml compose.nginx.yml Caddyfile install.sh; do
    [[ $seen == *$'\n'"$name"$'\n'* ]] || eh_error "В архиве отсутствует $name."
  done
}

eh_check_manifest() {
  local directory=$1 line name hash seen=$'\n' count=0 actual_count
  [[ -f $directory/SHA256SUMS && ! -L $directory/SHA256SUMS ]] || eh_error 'Отсутствует SHA256SUMS.'
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^([a-fA-F0-9]{64})[[:space:]][[:space:]]([A-Za-z0-9][A-Za-z0-9._-]*)$ ]] || { eh_error 'Некорректный внутренний SHA256 manifest.'; return 1; }
    hash=${BASH_REMATCH[1]}; name=${BASH_REMATCH[2]}
    [[ $name != SHA256SUMS && $seen != *$'\n'"$name"$'\n'* && -f $directory/$name && ! -L $directory/$name ]] || { eh_error 'Неверный или повторяющийся файл в SHA256SUMS.'; return 1; }
    [[ $(sha256sum "$directory/$name" | cut -d' ' -f1) == "$(printf '%s' "$hash" | tr A-F a-f)" ]] || { eh_error "Не совпала контрольная сумма $name."; return 1; }
    seen+="$name"$'\n'; count=$((count + 1))
  done < "$directory/SHA256SUMS"
  # On resume, generated state is intentionally outside the release manifest.
  for name in VERSION compose.yml "compose.$eh_mode.yml" Caddyfile install.sh; do
    [[ $seen == *$'\n'"$name"$'\n'* ]] || eh_error "Manifest не покрывает $name."
  done
  if [[ $directory == "$eh_download_directory/extracted" ]]; then
    actual_count=$(find "$directory" -maxdepth 1 -type f | wc -l)
    [[ $((count + 1)) -eq $actual_count ]] || eh_error 'Не все файлы архива покрыты SHA256SUMS.'
  fi
}

eh_prepare_release() {
  if (( eh_existing )); then
    eh_check_manifest "$eh_directory"
    [[ $(tr -d '\r\n' < "$eh_directory/VERSION") == "$eh_release" ]] || eh_error 'VERSION не соответствует сохранённой конфигурации.'
    return
  fi
  eh_download_directory=$(mktemp -d /tmp/email-host-install.XXXXXXXX)
  local url unpacked_version
  if [[ -z $eh_release ]]; then
    eh_https_download "$eh_download_origin/install/releases/latest" "$eh_download_directory/latest" || eh_error 'Не удалось загрузить версию. Первый установочный выпуск может быть ещё не опубликован; системные изменения не выполнены.'
    eh_release=$(cat "$eh_download_directory/latest")
    eh_valid_version "$eh_release" || eh_error 'Сервер вернул неподдерживаемую версию.'
  fi
  eh_note "Загружаю выпуск $eh_release."
  url="$eh_download_origin/install/releases/$eh_release"
  eh_https_download "$url/email-host-deploy.tar.gz" "$eh_download_directory/email-host-deploy.tar.gz"
  eh_https_download "$url/email-host-deploy.tar.gz.sha256" "$eh_download_directory/archive.sha256"
  eh_validate_archive "$eh_download_directory/email-host-deploy.tar.gz" "$eh_download_directory/archive.sha256"
  mkdir "$eh_download_directory/extracted"
  (ulimit -f 16384; tar --extract --gzip --file "$eh_download_directory/email-host-deploy.tar.gz" --directory "$eh_download_directory/extracted" --no-same-owner --no-same-permissions)
  eh_check_manifest "$eh_download_directory/extracted"
  unpacked_version=$(tr -d '\r\n' < "$eh_download_directory/extracted/VERSION")
  [[ $unpacked_version == "$eh_release" ]] || eh_error 'Версия внутри архива отличается от выбранного выпуска.'
  install -d -m 0700 "$eh_directory"
  # A complete marker makes an interrupted file copy recognizable on the next run.
  printf 'Email Host public installer\n' > "$eh_download_directory/install-marker"
  if [[ ! -e $eh_directory/.email-host-install ]]; then
    cp "$eh_download_directory/install-marker" "$eh_directory/.email-host-install.pending"
    mv --no-clobber "$eh_directory/.email-host-install.pending" "$eh_directory/.email-host-install"
  fi
  local file
  for file in "$eh_download_directory/extracted/"*; do install -m 0600 "$file" "$eh_directory/"; done
  local pending_conf pending_mode
  pending_conf=$(mktemp "$eh_directory/.installation-conf.XXXXXXXX")
  pending_mode=$(mktemp "$eh_directory/.installation-mode.XXXXXXXX")
  printf "EMAIL_HOST_VERSION='%s'\nAPP_DOMAIN='%s'\nCONVEX_DOMAIN='%s'\nCONVEX_SITE_DOMAIN='%s'\n" "$eh_release" "$eh_app_domain" "$eh_convex_domain" "$eh_site_domain" > "$pending_conf"
  printf '%s\n' "$eh_mode" > "$pending_mode"
  mv -T "$pending_conf" "$eh_directory/installation.conf"
  mv -T "$pending_mode" "$eh_directory/installation.mode"
}

eh_run() {
  local message=$1; shift
  eh_note "$message"
  if ! "$@" >> "$eh_log" 2>&1; then
    eh_error "$message: команда не завершилась успешно. Настройки сохранены. Подробности в $eh_log, доступном только root."
    return 1
  fi
}

eh_install_docker() {
  if command -v docker >/dev/null; then
    docker compose version >/dev/null 2>&1 || eh_error 'Найден Docker без Compose v2. Установите compose plugin по https://docs.docker.com/compose/install/linux/ и запустите мастер снова.'
    docker info >/dev/null 2>&1 || eh_error 'Docker daemon недоступен. Исправьте его состояние и запустите мастер снова.'
    return
  fi
  [[ -r /etc/os-release && -x /usr/bin/apt-get ]] || eh_error 'Подготовьте Docker Engine и Compose: https://docs.docker.com/engine/install/ . Затем повторите запуск.'
  local distribution codename architecture
  distribution=$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')
  codename=$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release | tr -d '"')
  case $distribution in ubuntu|debian) ;; *) eh_error 'Автоматическая установка Docker поддерживает Ubuntu/Debian. Установите Docker вручную и повторите запуск.' ;; esac
  [[ $codename =~ ^[a-z]+$ ]] || eh_error 'Не удалось определить codename ОС для Docker apt.'
  architecture=$(dpkg --print-architecture)
  [[ $architecture == amd64 || $architecture == arm64 ]] || eh_error 'Docker package architecture не поддерживается.'
  local package
  for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      eh_error "Найден пакет $package. Установщик не удаляет/заменяет существующие container packages. Подготовьте Docker вручную."
      return 1
    fi
  done
  [[ ! -L /etc/apt/sources.list.d/email-host-docker.sources && ! -L /etc/apt/keyrings/email-host-docker.asc ]] || eh_error 'Docker apt-файлы не должны быть символическими ссылками.'
  eh_run 'Устанавливаю зависимости apt для Docker.' apt-get update
  eh_run 'Устанавливаю ca-certificates.' apt-get install -y ca-certificates
  install -d -m 0755 /etc/apt/keyrings
  [[ -n $eh_download_directory ]] || eh_download_directory=$(mktemp -d /tmp/email-host-install.XXXXXXXX)
  eh_https_download "https://download.docker.com/linux/$distribution/gpg" "$eh_download_directory/docker.asc"
  cat > "$eh_download_directory/docker.sources" <<DOCKER_APT
Types: deb
URIs: https://download.docker.com/linux/$distribution
Suites: $codename
Components: stable
Architectures: $architecture
Signed-By: /etc/apt/keyrings/email-host-docker.asc
DOCKER_APT
  local source destination
  for source in docker.asc docker.sources; do
    if [[ $source == docker.asc ]]; then destination=/etc/apt/keyrings/email-host-docker.asc; else destination=/etc/apt/sources.list.d/email-host-docker.sources; fi
    if [[ -e $destination ]]; then
      cmp -s "$eh_download_directory/$source" "$destination" || eh_error 'Существующие Docker apt-файлы отличаются от ожидаемых. Автоматическая перезапись запрещена.'
    else install -m 0644 "$eh_download_directory/$source" "$destination"; fi
  done
  eh_run 'Обновляю каталог пакетов Docker.' apt-get update
  eh_run 'Устанавливаю Docker Engine и Compose.' apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  docker info >/dev/null 2>&1 || eh_error 'Docker установлен, но daemon не готов. Проверьте systemctl status docker, затем повторите мастер.'
}

eh_prepare_configuration() {
  local image="ghcr.io/0legsan/email-host-api:$eh_release"
  if [[ ! -f $eh_directory/.env ]]; then
    eh_run 'Генерирую закрытую конфигурацию.' docker run --rm --network none \
      --mount "type=bind,source=$eh_directory,target=/config" "$image" \
      bun deploy/public/bootstrap.mjs --output /config --app-domain "$eh_app_domain" \
      --convex-domain "$eh_convex_domain" --convex-site-domain "$eh_site_domain" --version "$eh_release"
  fi
  if [[ -f $eh_directory/.env && ! -e $eh_directory/credentials.txt ]]; then
    eh_run 'Восстанавливаю файл начального доступа без замены ключей.' docker run --rm --network none \
      --mount "type=bind,source=$eh_directory,target=/config" "$image" \
      bun deploy/public/bootstrap.mjs --recover-credentials --output /config
  fi
  [[ -f $eh_directory/.env && -f $eh_directory/credentials.txt && ! -L $eh_directory/credentials.txt ]] || eh_error 'Bootstrap не создал обычные файлы конфигурации и credentials.txt.'
  [[ $(stat -c %a "$eh_directory/.env") == 600 && $(stat -c %a "$eh_directory/credentials.txt") == 600 ]] || eh_error 'Сгенерированные секреты должны иметь права 0600.'
}

eh_check_image_ids() {
  local ids=$1 line config_digest descriptor_digest reference current count=0 seen=$'\n'
  eh_images_missing=0
  [[ -f $ids && ! -L $ids ]] || eh_error 'Выпуск не содержит список образов для архитектуры сервера. Package-only архив не подходит для установки.'
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^(sha256:[a-f0-9]{64}),(sha256:[a-f0-9]{64})[[:space:]][[:space:]]([A-Za-z0-9][A-Za-z0-9./:_-]*)$ ]] || eh_error 'Некорректный список image IDs.'
    config_digest=${BASH_REMATCH[1]}; descriptor_digest=${BASH_REMATCH[2]}; reference=${BASH_REMATCH[3]}
    case $reference in
      "ghcr.io/0legsan/email-host-api:$eh_release"|"ghcr.io/0legsan/email-host-web:$eh_release"|"email-host/postgres:$eh_release"|"email-host/convex-backend:$eh_release"|"email-host/caddy:$eh_release") ;;
      *) eh_error 'В списке образов есть неизвестный reference.' ;;
    esac
    [[ $seen != *$'\n'"$reference"$'\n'* ]] || eh_error 'Повторяющийся образ в image IDs.'
    seen+="$reference"$'\n'; count=$((count + 1))
    if current=$(docker image inspect --format '{{.Id}}' "$reference" 2>/dev/null); then
      [[ $current == "$config_digest" || $current == "$descriptor_digest" ]] || eh_error "Существующий tag $reference указывает на другой образ. Автоматическая замена запрещена."
    else
      eh_images_missing=1
    fi
  done < "$ids"
  [[ $count -eq 5 ]] || eh_error 'В выпуске должны быть ровно пять runtime images.'
  return 0
}

eh_prepare_images() {
  local architecture ids url line checksum
  case $(uname -m) in x86_64) architecture=linux-amd64 ;; aarch64|arm64) architecture=linux-arm64 ;; *) eh_error 'Неизвестная архитектура образов.' ;; esac
  ids="$eh_directory/images-$architecture.ids"
  grep -Eq "^[a-fA-F0-9]{64}  images-$architecture[.]ids$" "$eh_directory/SHA256SUMS" || eh_error 'Список image IDs не покрыт контрольными суммами выпуска.'
  eh_check_image_ids "$ids"
  if (( ! eh_images_missing )); then
    eh_note 'Образы этой версии уже загружены и совпадают с image IDs.'
    return 0
  fi
  [[ -n $eh_download_directory ]] || eh_download_directory=$(mktemp -d /tmp/email-host-install.XXXXXXXX)
  url="$eh_download_origin/install/releases/$eh_release/$architecture"
  eh_https_download "$url/email-host-images.tar.gz.sha256" "$eh_download_directory/images.sha256"
  line=$(cat "$eh_download_directory/images.sha256")
  [[ $line =~ ^([a-fA-F0-9]{64})[[:space:]][[:space:]]email-host-images.tar.gz$ ]] || eh_error 'Некорректная контрольная сумма архива образов.'
  checksum=${BASH_REMATCH[1]}
  eh_note "Загружаю готовые образы $architecture с $eh_download_origin."
  curl --fail --progress-bar --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 1800 --retry 2 --max-filesize 2147483648 \
    "$url/email-host-images.tar.gz" --output "$eh_download_directory/email-host-images.tar.gz"
  [[ $(sha256sum "$eh_download_directory/email-host-images.tar.gz" | cut -d' ' -f1) == "$(printf '%s' "$checksum" | tr A-F a-f)" ]] || eh_error 'Контрольная сумма готовых образов не совпала.'
  eh_run 'Загружаю проверенные образы в Docker.' docker load -i "$eh_download_directory/email-host-images.tar.gz"
  eh_check_image_ids "$ids"
  (( ! eh_images_missing )) || eh_error 'В Docker не появились все ожидаемые образы выпуска.'
  return 0
}

eh_guard_project() {
  local containers container directory
  containers=$(docker ps -a --filter label=com.docker.compose.project=email-host --format '{{.ID}}')
  while IFS= read -r container; do
    [[ -n $container ]] || continue
    directory=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container")
    [[ $directory == "$eh_directory" ]] || eh_error 'Docker project email-host уже принадлежит другому каталогу. Существующие контейнеры не изменены.'
  done <<< "$containers"
  if [[ ! -f $eh_directory/.env ]] && [[ -n $(docker volume ls --filter label=com.docker.compose.project=email-host --format '{{.Name}}') ]]; then
    eh_error 'Найдены существующие volumes проекта email-host без распознанной конфигурации. Установщик не будет использовать незнакомые данные.'
  fi
  if [[ ! -f $eh_directory/.env ]]; then
    local volume
    for volume in email-host_convex-postgres-data email-host_convex-data email-host_caddy-data email-host_caddy-config; do
      if docker volume inspect "$volume" >/dev/null 2>&1; then
        eh_error "Том $volume уже существует без распознанной конфигурации. Установщик не будет использовать незнакомые данные."
      fi
    done
  fi
}

eh_choose_proxy_setting() {
  local prompt=$1 candidates=$2 answer default=
  if [[ -n $candidates && $candidates != *$'\n'* ]]; then default=$candidates; fi
  if [[ -n $candidates ]]; then eh_note "Найдены варианты: ${candidates//$'\n'/, }"; fi
  while :; do
    answer=$(eh_read "$prompt" "$default")
    if eh_valid_proxy_name "$answer"; then printf '%s' "$answer"; return; fi
    eh_note 'Допустимы буквы, цифры, точка, дефис и подчёркивание. Нужен существующий параметр Traefik.'
  done
}

eh_prepare_proxy() {
  [[ ! -L $eh_directory/proxy.env ]] || eh_error 'proxy.env не должен быть символической ссылкой.'
  [[ ! -f $eh_directory/proxy.env ]] || return 0
  if [[ $eh_mode == standalone ]]; then
    command -v ss >/dev/null || eh_error 'Нужна утилита ss из iproute2 для проверки свободных 80/443.'
    if ss -H -ltn '( sport = :80 or sport = :443 )' | grep -q .; then
      eh_error 'Порты 80/443 уже заняты. Выберите режим существующего Traefik/Nginx в отдельном каталоге; чужие процессы не остановлены.'
      return 1
    fi
    printf '# Standalone proxy does not need external network settings.\n' > "$eh_directory/proxy.env"
  elif [[ $eh_mode == nginx ]]; then
    command -v ss >/dev/null || eh_error 'Нужна утилита ss из iproute2 для проверки loopback-портов.'
    if ss -H -ltn '( sport = :18080 or sport = :13210 or sport = :13211 )' | grep -q .; then
      eh_error 'Порты 18080/13210/13211 уже заняты. Освободите их по своей процедуре или используйте отдельный сервер. Установщик чужие процессы не останавливает.'
    fi
    printf 'WEB_PORT=18080\nCONVEX_PORT=13210\nCONVEX_SITE_PORT=13211\n' > "$eh_directory/proxy.env"
  else
    local ids container arguments networks entrypoints resolvers network entrypoint resolver
    ids=$(docker ps --format '{{.ID}} {{.Image}}' | awk '$2 ~ /(^|\/)traefik(:|@)/ {print $1}')
    if [[ -z $ids || $ids == *$'\n'* ]]; then
      eh_note 'Traefik не распознан однозначно. Укажите ID его работающего контейнера.'
      container=$(eh_read 'Container ID Traefik')
      [[ $container =~ ^[a-f0-9]{12,64}$ ]] || eh_error 'Нужен существующий Docker container ID.'
    else container=$ids; fi
    [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || eh_error 'Контейнер Traefik не запущен.'
    arguments=$(docker inspect --format '{{range .Args}}{{println .}}{{end}}' "$container")
    networks=$(docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$container" | sed '/^bridge$/d; /^host$/d; /^none$/d; /^$/d')
    entrypoints=$(printf '%s\n' "$arguments" | awk 'tolower($0) ~ /^--entrypoints\.[^.]+\.address=.*:443(\/tcp)?$/ {split($0,a,".");print a[2]}' | sort -u)
    resolvers=$(printf '%s\n' "$arguments" | awk 'tolower($0) ~ /^--certificatesresolvers\.[^.]+\.acme\./ {split($0,a,".");print a[2]}' | sort -u)
    network=$(eh_choose_proxy_setting 'Существующая Docker-сеть Traefik' "$networks")
    docker network inspect "$network" >/dev/null 2>&1 || eh_error 'Указанная Docker-сеть не существует.'
    printf '%s\n' "$networks" | grep -Fxq "$network" || eh_error 'Traefik не подключён к выбранной Docker-сети.'
    entrypoint=$(eh_choose_proxy_setting 'HTTPS entrypoint Traefik' "$entrypoints")
    if [[ -n $resolvers ]]; then
      resolver=$(eh_choose_proxy_setting 'Существующий ACME certificate resolver' "$resolvers")
    else
      eh_note 'ACME resolver не распознан. Для уже настроенных сертификатов Traefik оставьте поле пустым.'
      resolver=$(eh_read 'ACME resolver или Enter для существующего TLS' '')
      [[ -z $resolver ]] || eh_valid_proxy_name "$resolver" || eh_error 'Некорректное имя ACME resolver.'
    fi
    printf "TRAEFIK_NETWORK='%s'\nTRAEFIK_ENTRYPOINT='%s'\nTRAEFIK_CERT_RESOLVER='%s'\n" "$network" "$entrypoint" "$resolver" > "$eh_directory/proxy.env"
  fi
}

eh_compose() {
  docker compose --project-name email-host --project-directory "$eh_directory" \
    --env-file "$eh_directory/.env" --env-file "$eh_directory/proxy.env" \
    -f "$eh_directory/compose.yml" -f "$eh_directory/compose.$eh_mode.yml" "$@"
}

eh_initialize_backend() {
  eh_run 'Проверяю Compose.' eh_compose config --quiet
  eh_run 'Запускаю PostgreSQL и Convex.' eh_compose up -d --pull never --wait --wait-timeout 180 convex-postgres convex-backend
  if [[ -z $(eh_env_value "$eh_directory/.env" CONVEX_SELF_HOSTED_ADMIN_KEY) ]]; then
    if [[ ! -s $eh_directory/.admin-key.pending ]]; then
      eh_note 'Создаю административный ключ Convex, без вывода ключа.'
      eh_compose exec -T convex-backend ./generate_admin_key.sh > "$eh_directory/.admin-key.pending" 2>> "$eh_log"
    fi
    eh_run 'Сохраняю административный ключ.' docker run --rm --network none -i \
      --mount "type=bind,source=$eh_directory,target=/config" "ghcr.io/0legsan/email-host-api:$eh_release" \
      bun deploy/public/bootstrap.mjs --set-admin-key --output /config < "$eh_directory/.admin-key.pending"
    rm -f -- "$eh_directory/.admin-key.pending"
  fi
  if [[ ! -f $eh_directory/.functions-ready ]]; then
    eh_run 'Задаю JWT issuer своего Convex.' eh_compose run --rm --pull never --no-deps -T --entrypoint bun api \
      node_modules/convex/bin/main.js env set CONVEX_AUTH_ISSUER "https://$eh_app_domain"
    eh_run 'Задаю внутренний JWKS endpoint.' eh_compose run --rm --pull never --no-deps -T --entrypoint bun api \
      node_modules/convex/bin/main.js env set CONVEX_AUTH_JWKS http://api:3001/api/auth/jwks
    eh_run 'Публикую функции в новый локальный Convex.' eh_compose run --rm --pull never --no-deps -T --entrypoint bun api \
      node_modules/convex/bin/main.js deploy --typecheck disable --codegen disable < /dev/null
    printf '%s\n' "$eh_release" > "$eh_directory/.functions-ready"
  fi
  eh_run 'Запускаю API и приложение.' eh_compose up -d --pull never --wait --wait-timeout 180 api web
  if [[ $eh_mode == standalone ]]; then
    eh_run 'Запускаю HTTPS proxy.' eh_compose up -d --pull never --wait --wait-timeout 120 proxy
  fi
}

eh_prepare_nginx() {
  local config="$eh_directory/nginx-email-host.conf" instructions="$eh_directory/NGINX-NEXT-STEPS.txt"
  [[ ! -L $config && ! -L $instructions ]] || eh_error 'Ссылки вместо Nginx-файлов запрещены.'
  if [[ ! -f $config ]]; then
    cat > "$config" <<'NGINX_MAP'
map $http_upgrade $email_host_connection_upgrade {
    default upgrade;
    '' close;
}
NGINX_MAP
    local domain port
    for domain in "$eh_app_domain" "$eh_convex_domain" "$eh_site_domain"; do
      case $domain in "$eh_app_domain") port=18080 ;; "$eh_convex_domain") port=13210 ;; *) port=13211 ;; esac
      cat >> "$config" <<NGINX_SITE
server {
    listen 80;
    server_name $domain;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$email_host_connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
}
NGINX_SITE
    done
  fi
  if [[ ! -f $instructions ]]; then
    cat > "$instructions" <<NGINX_NEXT
Email Host containers run behind loopback ports. Public HTTPS is not configured yet.

1. Review $config. Do not add duplicate server_name entries to existing sites.
2. If /etc/nginx/conf.d/*.conf is included inside your nginx http context,
   install this new file only if the destination does not already exist:
     test ! -e /etc/nginx/conf.d/email-host.conf && test ! -L /etc/nginx/conf.d/email-host.conf && install -m 0644 '$config' /etc/nginx/conf.d/email-host.conf
3. Validate before reload:
     nginx -t && systemctl reload nginx
4. If you use Certbot's Nginx plugin and accept the certificate authority terms,
   obtain HTTPS for all three names, reviewing the selected virtual hosts:
     certbot --nginx -d '$eh_app_domain' -d '$eh_convex_domain' -d '$eh_site_domain'
   Otherwise add certificates using your existing TLS management procedure.
5. Run this installer again after enabling HTTPS. It keeps the same keys/data
   and checks https://$eh_app_domain/health and https://$eh_convex_domain/version.

The installer has not modified /etc/nginx or reloaded your proxy.
NGINX_NEXT
  fi
  eh_note "Конфиг Nginx подготовлен: $config."
  eh_note "Действия для безопасного подключения и HTTPS: $instructions."
}

eh_application_health() {
  local health jwks key_id
  health=$(curl --fail --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 --max-filesize 65536 \
    "https://$eh_app_domain/health" 2>> "$eh_log") || return 1
  [[ $(printf '%s' "$health" | tr -d '[:space:]') == '{"ok":true,"data":{"status":"ok"}}' ]] || return 1
  jwks=$(curl --fail --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 --max-filesize 65536 \
    "https://$eh_app_domain/api/auth/jwks" 2>> "$eh_log") || return 1
  key_id=$(eh_env_value "$eh_directory/.env" CONVEX_JWT_KEY_ID)
  [[ $key_id =~ ^[A-Za-z0-9-]+$ ]] || return 1
  printf '%s' "$jwks" | tr -d '[:space:]' | grep -Fq "\"kid\":\"$key_id\""
}

eh_verify_public() {
  eh_note 'Проверяю публичный HTTPS. DNS и сертификаты должны быть готовы.'
  local attempt
  for attempt in $(seq 1 12); do
    if eh_application_health &&
      curl --fail --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 --max-filesize 65536 \
        "https://$eh_convex_domain/version" --output /dev/null 2>> "$eh_log" &&
      curl --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 --max-filesize 65536 \
        "https://$eh_site_domain/" --output /dev/null 2>> "$eh_log"; then
      printf '%s\n' "$eh_release" > "$eh_directory/.verified"
      eh_note "Приложение отвечает по HTTPS: https://$eh_app_domain/ ."
      eh_note "Первый вход owner@$eh_app_domain. Секретный пароль находится в $eh_directory/credentials.txt."
      eh_note 'Это проверка готовности HTTP. Подключите свой IMAP/SMTP ящик и проверьте получение и отправку отдельно.'
      return
    fi
    [[ $eh_mode != nginx ]] || break
    eh_note "HTTPS ещё не готов. Повторная проверка $attempt/12."
    sleep 5
  done
  eh_note 'Контейнеры запущены, но публичная готовность не подтверждена. Не считайте установку завершённой.'
  eh_note "Проверьте DNS, сертификаты и proxy. Настройки и пароль сохранены в $eh_directory."
  eh_note "Исправьте подключение и повторите: sudo bash $eh_directory/install.sh"
  return 2
}

eh_main() {
  eh_parse_arguments "$@"
  eh_preflight
  trap eh_cleanup EXIT
  eh_choose_configuration
  eh_acquire_lock
  local previously_existing=$eh_existing
  eh_existing=0
  # Another wizard may have completed while this one waited at the prompt.
  eh_preflight
  if (( previously_existing && ! eh_existing )); then
    eh_error 'Существующее состояние изменилось во время ожидания. Проверьте каталог и повторите запуск.'
  fi
  if (( eh_existing != previously_existing )); then eh_choose_configuration; fi
  eh_prepare_release
  eh_log="$eh_directory/install.log"
  touch "$eh_log"; chmod 0600 "$eh_log"
  eh_install_docker
  eh_guard_project
  eh_prepare_images
  eh_prepare_configuration
  eh_prepare_proxy
  eh_initialize_backend
  if [[ $eh_mode == nginx ]]; then eh_prepare_nginx; fi
  eh_verify_public
}

if [[ ${BASH_SOURCE[0]:-} == "$0" || -z ${BASH_SOURCE[0]:-} ]]; then
  eh_main "$@"
fi
