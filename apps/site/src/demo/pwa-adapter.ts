// The public demo never registers a worker or installs a PWA on the visitor's device.
export function usePwaUpdate(options: { enabled: boolean }) {
  void options
  return {
    updateAvailable: false,
    updating: false,
    applyUpdate: async () => undefined,
    dismissUpdate: () => undefined,
  }
}

export async function checkForPwaUpdate() {
  return undefined
}
