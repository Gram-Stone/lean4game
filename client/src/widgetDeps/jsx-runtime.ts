import * as JsxNS from 'react/jsx-runtime'
const Jsx: any = (JsxNS as any).default ?? JsxNS
export default Jsx
export const { Fragment, jsx, jsxs } = Jsx
