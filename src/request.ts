import * as core from '@actions/core'
import FormData from 'form-data'
import {baseURL} from './util'
import {resolve} from 'path'
import {createReadStream} from 'fs'
import axios from 'axios'
import {
  InitialUploadDetails,
  TryUpdateResult,
  UploadDetails,
  VersionDetails
} from './types.d'

export async function createUpload(
  xpiPath: string,
  token: string,
  channel: string
): Promise<InitialUploadDetails> {
  const url = `${baseURL}/addons/upload/`
  const body = new FormData()

  core.debug(`Uploading ${xpiPath}`)
  body.append('upload', createReadStream(resolve(xpiPath)))
  body.append('channel', channel)

  const response = await axios.post(url, body, {
    headers: {
      ...body.getHeaders(),
      Authorization: `JWT ${token}`
    }
  })
  core.debug(`Create upload response: ${JSON.stringify(response.data)}`)
  return response.data
}

export async function tryUpdateExtension(
  guid: string,
  uuid: string,
  token: string,
  srcPath?: string
): Promise<TryUpdateResult> {
  const details = await getUploadDetails(uuid, token)
  if (!details.valid) {
    return {success: false}
  }

  const url = `${baseURL}/addons/addon/${guid}/versions/`
  const body = new FormData()
  body.append('upload', uuid)
  if (srcPath) {
    core.debug(`Uploading ${srcPath}`)
    body.append('source', createReadStream(resolve(srcPath)))
  }

  core.debug(`Updating extension ${guid} with ${uuid}`)
  const response = await axios.post(url, body, {
    headers: {
      ...body.getHeaders(),
      Authorization: `JWT ${token}`
    }
  })
  core.debug(`Create version response: ${JSON.stringify(response.data)}`)
  return {
    success: true,
    versionDetails: response.data
  }
}

export async function getUploadDetails(
  uuid: string,
  token: string
): Promise<UploadDetails> {
  const url = `${baseURL}/addons/upload/${uuid}/`
  const response = await axios.get(url, {
    headers: {
      Authorization: `JWT ${token}`
    }
  })
  core.debug(
    `Get upload details probe response: ${JSON.stringify(response.data)}`
  )
  return response.data
}

export async function getVersionDetails(
  guid: string,
  token: string,
  versionID: number
): Promise<VersionDetails> {
  const url = `${baseURL}/addons/addon/${guid}/versions/${versionID}`
  const response = await axios.get(url, {
    headers: {
      Authorization: `JWT ${token}` // if it's unlisted we do need authorization
    }
  })
  core.debug(`Get version details response: ${JSON.stringify(response.data)}`)
  return response.data
}
