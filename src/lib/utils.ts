import 'dotenv/config'
import { NodeSSH } from 'node-ssh'
import { readFile } from 'node:fs/promises'

export async function runSSH(command: string) {
  const ssh = new NodeSSH()
  await ssh.connect({
    host: process.env.SSH_HOST,
    username: process.env.SSH_USER,
    privateKey: (await readFile(process.env.SSH_PRIVATE_KEY_FILE!)).toString(),
  })
  const { stdout, stderr } = await ssh.execCommand(command)
  return [stdout, stderr]
}

export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${size / 1024} KB` // zfs rounds to kb?
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`
  return `${(size / 1024 ** 3).toFixed(2)} GB`
}

type CommonInfo = {
  name: string
  used: number
}
type SetInfo = CommonInfo & {
  logicalused: number
  available: number
  compression: string
  ratio: number
  copies: number
  dedup: string
  prefetch: string
  primarycache: string
  secondarycache: string
  quota: number | null
}
type Snapshot = CommonInfo
type Dataset = SetInfo & {
  snapshots: Snapshot[]
}
type PoolInfo = SetInfo & {
  datasets: Dataset[]
}
export async function listPools() {
  const [output] = await runSSH(
    'zfs list -p -H -t all -o name,used,logicalused,avail,compression,ratio,copies,dedup,prefetch,primarycache,secondarycache,snapshot_count,snapshots_changed,quota'
  )
  return output.split('\n').reduce(
    (acc, line) => {
      const [
        name,
        used,
        logicalused,
        available,
        compression,
        ratio,
        copies,
        dedup,
        prefetch,
        primarycache,
        secondarycache,
        quota,
      ] = line.split('\t')
      const [pool, datasetSnapshot] = name.split('/')
      const [dataset, snapshot] = (datasetSnapshot ?? '').split('@')
      if (snapshot) {
        acc[pool].datasets.at(-1)?.snapshots.push({
          name: snapshot,
          used: +used,
        })
      } else {
        const data = {
          name: dataset || pool,
          used: +used,
          logicalused: +logicalused,
          available: +available,
          compression,
          ratio: parseFloat(ratio),
          copies: parseInt(copies),
          dedup,
          prefetch,
          primarycache,
          secondarycache,
          quota: quota ? +quota : null,
        }
        if (dataset) {
          acc[pool].datasets.push({
            ...data,
            snapshots: [],
          })
        } else if (pool) {
          acc[pool] = {
            ...data,
            datasets: [],
          }
        }
      }
      return acc
    },
    {} as Record<string, PoolInfo>
  )
}

export async function listOptions() {
  const [, output] = await runSSH('zfs get')
  const options = []
  for (const line of output.split('\n')) {
    const [, prop, edit, inherit, values] =
      line.match(/\t([^ ]+) {2,}([^ ]+) {2,}([^ ]+) {2,}([^< ].+\|.+)$/) ?? []
    if (prop) {
      options.push({
        prop,
        edit: edit === 'YES',
        inherit: inherit === 'YES',
        values: values.split('|').map((v) => v.trim()),
      })
    }
  }
  return options
}
