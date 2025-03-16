import reduceCSSCalc from 'reduce-css-calc'

export default function renderCalc(val) {
  return reduceCSSCalc(`calc(${val})`, 150)
}
