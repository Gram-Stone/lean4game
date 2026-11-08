import * as DomNS from 'react-dom'
const ReactDOM: any = (DomNS as any).default ?? DomNS
export default ReactDOM
export const { createPortal, findDOMNode, flushSync, render, unmountComponentAtNode, unstable_batchedUpdates, version } = ReactDOM
