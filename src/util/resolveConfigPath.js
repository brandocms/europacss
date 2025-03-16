import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import { defaultConfigFile, cjsConfigFile } from '../constants'

export default function resolveConfigPath(filePath) {
  if (_.isObject(filePath)) {
    return undefined
  }

  if (!_.isUndefined(filePath)) {
    return path.resolve(filePath)
  }

  for (const configFile of [defaultConfigFile, cjsConfigFile]) {
    try {
      const configPath = path.resolve(configFile)
      fs.accessSync(configPath)
      return configPath
    } catch (err) {}
  }

  return undefined
}
