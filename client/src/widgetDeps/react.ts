/** Lets Lean widget modules (loaded from blob URLs) use the app's own React instance. */
import * as ReactNS from 'react'
const React: any = (ReactNS as any).default ?? ReactNS
export default React
export const {
  Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, cloneElement, createContext, createElement,
  createFactory, createRef, forwardRef, isValidElement, lazy, memo, startTransition,
  useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle,
  useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  useTransition, version
} = React
