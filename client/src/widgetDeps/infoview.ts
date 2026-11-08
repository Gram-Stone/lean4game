/**
 * The `@leanprover/infoview` API as seen by Lean widget modules.
 *
 * lean4game bundles an older infoview. Current ProofWidgets (and Mathlib's string-diagram
 * widget) also import `EnvPosContext`, `useRpcSession` and `useAsyncPersistent`,
 * which that version lacks, so they are provided here on top of it.
 */
import * as React from 'react'
import type { AsyncState, DocumentPosition } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/util'
import { RpcContext } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/rpcSessions'
import { useAsync } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/util'

export * from '@leanprover/infoview-api'
export { useAsync, useAsyncWithTrigger, useEvent, useEventResult, useServerNotificationEffect,
  useServerNotificationState, useClientNotificationEffect, useClientNotificationState,
  mapRpcError } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/util'
export { EditorContext, VersionContext } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/contexts'
export { EditorConnection } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/editorConnection'
export { RpcContext } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/rpcSessions'
export { ServerVersion } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/serverVersion'
export { GoalsLocation } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/goalLocation'
export { importWidgetModule, DynamicComponent } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/userWidget'
export { InteractiveCode } from '../../../node_modules/vscode-lean4/lean4-infoview/src/infoview/interactiveCode'

/** The position in the document a widget is shown for. Provided around each panel widget. */
// Kept on globalThis so the app and widget modules share one context object even if the
// dev server serves this file under two URLs.
const g = globalThis as any
export const EnvPosContext: React.Context<DocumentPosition | undefined> =
  g.__leanEnvPosContext ?? (g.__leanEnvPosContext = React.createContext<DocumentPosition | undefined>(undefined))

/** The RPC session for the current position. */
export function useRpcSession() {
  return React.useContext(RpcContext)
}

/** Like `useAsync`, but keeps showing the last resolved value while a new one loads. */
export function useAsyncPersistent<T>(fn: () => Promise<T>, deps: React.DependencyList = []): AsyncState<T> {
  const state = useAsync(fn, deps)
  const last = React.useRef<AsyncState<T>>(state)
  if (state.state !== 'loading') last.current = state
  return state.state === 'loading' && last.current.state === 'resolved' ? last.current : state
}
