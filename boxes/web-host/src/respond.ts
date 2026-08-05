import type { NextFunction, Request, Response } from 'express'
import type { ErrorCode, ErrorShape } from '#errors'
import { isObserverError, toErrorShape } from '#errors'

/** The status a framework error (serve-static, body-parser) already decided for itself. */
function frameworkStatus(error: unknown): number | null {
  if (error === null || typeof error !== 'object') return null
  const raw = (error as { status?: unknown; statusCode?: unknown })
  const value = typeof raw.status === 'number' ? raw.status : raw.statusCode
  return typeof value === 'number' && value >= 400 && value <= 599 ? value : null
}

const FRAMEWORK_CODE: Record<number, ErrorCode> = {
  404: 'UNKNOWN_ARTIFACT',
  413: 'ARTIFACT_TOO_LARGE',
}

function shapeOf(error: unknown, status: number): ErrorShape {
  const shape = toErrorShape(error)
  if (isObserverError(error)) return shape
  const code = FRAMEWORK_CODE[status] ?? (status < 500 ? 'INVALID_PATCH' : 'INTERNAL')
  return { code, message: shape.message, hint: 'Check the request against the web-host contract.' }
}

/** Every failure leaves this box as `{ code, message, hint }`, and never as a stack trace. */
export function sendError(res: Response, error: unknown): void {
  const status = isObserverError(error) ? error.status : (frameworkStatus(error) ?? 500)
  res.status(status).json(shapeOf(error, status))
}

/** A path this server owns but serves nothing at. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    code: 'UNKNOWN_ARTIFACT',
    message: `Nothing is served at ${req.path}.`,
    hint: 'Check the path against the web-host contract.',
  })
}

/**
 * Exactly four parameters, or Express never calls it. A rejection that lands after the
 * response went out is handed on rather than throwing ERR_HTTP_HEADERS_SENT.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error)
    return
  }
  sendError(res, error)
}
