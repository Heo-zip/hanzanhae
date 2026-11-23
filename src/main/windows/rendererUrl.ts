import { is } from '@electron-toolkit/utils'
import { PACKAGED_RENDERER_URL } from '../camera/security'

export function rendererUrl(view?: 'garden'): string {
  const developmentUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
  const url = new URL(developmentUrl || PACKAGED_RENDERER_URL)
  if (view) url.searchParams.set('view', view)
  return url.href
}
