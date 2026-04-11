// Minimal Pages Router error page — overrides Next.js's internal /_error
// which uses useRef and fails during static pre-rendering in Next.js 14.2.
function Error({ statusCode }) {
  return null
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
