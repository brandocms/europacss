import evaluateEuropaFunctions from './evaluateEuropaFunctions'
import substituteIfAtRules from './substituteIfAtRules'
import substituteColorAtRules from './substituteColorAtRules'
import substituteDisplayAtRules from './substituteDisplayAtRules'
import substituteOrderAtRules from './substituteOrderAtRules'
import substituteEuropaAtRules from './substituteEuropaAtRules'
import substituteIterateAtRules from './substituteIterateAtRules'
import substituteUnpackAtRules from './substituteUnpackAtRules'
import substituteAtruleAliases from './substituteAtruleAliases'
import substituteSpaceAtRules from './substituteSpaceAtRules'
import substituteFontAtRules from './substituteFontAtRules'
import substituteFontsizeAtRules from './substituteFontsizeAtRules'
import substituteColumnAtRules from './substituteColumnAtRules'
import substituteResponsiveAtRules from './substituteResponsiveAtRules'
import substituteEmbedResponsiveAtRules from './substituteEmbedResponsiveAtRules'
import substituteGridAtRules from './substituteGridAtRules'
import substituteRowAtRules from './substituteRowAtRules'
import substituteAbs100AtRules from './substituteAbs100AtRules'

export default [
  substituteEuropaAtRules,
  substituteIfAtRules,
  substituteColorAtRules,
  evaluateEuropaFunctions,
  substituteGridAtRules,
  substituteDisplayAtRules,
  substituteOrderAtRules,
  substituteIterateAtRules,
  substituteUnpackAtRules,
  substituteAtruleAliases,
  substituteSpaceAtRules,
  substituteFontAtRules,
  substituteFontsizeAtRules,
  substituteEmbedResponsiveAtRules,
  substituteColumnAtRules,
  substituteResponsiveAtRules,
  substituteRowAtRules,
  substituteAbs100AtRules
]
