export default function findResponsiveParent(node) {
  let current = node
  while (current) {
    if (current.type === 'atrule' && current.__isResponsive) {
      return current
    }
    current = current.parent
  }
  return null
}
