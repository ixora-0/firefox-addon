import * as core from '@actions/core'
import {generateJWT} from './util'
import {
  createUpload,
  getVersionDetails,
  tryUpdateExtension,
  downloadFile
} from './request'

async function run(): Promise<void> {
  try {
    const guid = core.getInput('guid', {required: true})
    const xpiPath = core.getInput('xpi_path', {required: true})
    const key = core.getInput('api_key', {required: true})
    const secret = core.getInput('api_secret', {required: true})
    const srcPath = core.getInput('src_path')
    const channel = core.getInput('channel') || 'listed'
    if (channel !== 'listed' && channel !== 'unlisted') {
      core.setFailed(
        'Invalid channel type. Channel must be either "listed" or "unlisted".'
      )
    }
    const waitUntilSigned = core.getBooleanInput('wait_until_signed') || false
    const downloadFileName = core.getInput('download_file_name')

    let token = generateJWT(key, secret)
    const uploadDetails = await createUpload(xpiPath, token, channel)

    const timeout = 10 * 60 * 1000
    const updateVersionRetryDelay = 5 * 1000
    const startTime = Date.now()

    let versionID: number
    const updateVersionInterval = setInterval(async () => {
      if (Date.now() - timeout > startTime) {
        throw new Error('Extension validation timed out')
      }
      token = generateJWT(key, secret)
      const result = await tryUpdateExtension(
        guid,
        uploadDetails.uuid,
        token,
        srcPath
      )
      if (result.success) {
        versionID = result.versionDetails.id
        core.setOutput('version_url', result.versionDetails.file.url)
        clearInterval(updateVersionInterval)
        if (waitUntilSigned) {
          core.info('Wating for version to be reviewed and approved')
          checkVersion()
        }
      }
    }, updateVersionRetryDelay)

    const initRetryDelay = 5 * 1000
    const maxRetryDelay = 60 * 60 * 1000
    const backoffFactor = 1.5
    let retryCount = 0

    // check if file finished being reviewed
    const checkVersion = async (): Promise<void> => {
      token = generateJWT(key, secret)
      const versionDetails = await getVersionDetails(guid, token, versionID)
      if (versionDetails.file.status === 'unreviewed') {
        const retryDelay = Math.min(
          initRetryDelay * Math.pow(backoffFactor, retryCount),
          maxRetryDelay
        )
        core.info(
          `Check #${
            retryCount + 1
          }: unreviewed at ${new Date().toLocaleString()}, trying again after ${Math.floor(
            retryDelay / 1000
          )}s`
        )
        retryCount++
        setTimeout(checkVersion, retryDelay)
        return
      }
      if (versionDetails.file.status === 'public') {
        core.info('\u001b[38;5;2mVersion has been approved\u001b[0m')
        if (downloadFileName) {
          token = generateJWT(key, secret)
          downloadFile(versionDetails.file.url, token, downloadFileName)
        }
      } else if (versionDetails.file.status === 'disabled') {
        core.info(
          '\u001b[38;5;1mVersion has been rejected, disabled, or not reviewed\u001b[0m'
        )
      }
    }
  } catch (error) {
    if (typeof error === 'object' && error && 'response' in error) {
      core.debug('Failed Request')
      if (
        typeof error.response === 'object' &&
        error.response &&
        'status' in error.response
      ) {
        core.debug(`Fail status: ${error.response.status}`)
      }

      if (
        typeof error.response === 'object' &&
        error.response &&
        'data' in error.response
      ) {
        core.debug(`Fail data: ${JSON.stringify(error.response.data)}`)
      }
    }

    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(
        'Unknown error. Try to rerun the job and check debug, there may be more information.'
      )
    }
  }
}

run()
