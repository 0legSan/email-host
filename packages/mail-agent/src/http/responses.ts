import type { Context } from "hono"

export function ok<T>(context: Context, data: T, status: 200 | 201 = 200) {
  return context.json(
    {
      ok: true,
      data,
    },
    status
  )
}

export function fail(
  context: Context,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500 | 503,
  code: string,
  message: string
) {
  return context.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    status
  )
}
