import { exec } from 'child_process'

export async function runProcess(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, (err, stdout) => {
      resolve(stdout)
    })
  })
}

export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${size / 1024} KB` // zfs rounds to kb?
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(2)} MB`
  return `${(size / 1024 ** 3).toFixed(2)} GB`
}

type Snapshot = {
  name: string
  used: number
}
type Dataset = {
  name: string
  used: number
  logicalused: number
  available: number
  compression: string
  ratio: number
  copies: number
  dedup: string
  snapshots: Snapshot[]
}
type PoolInfo = {
  name: string
  used: number
  logicalused: number
  available: number
  compression: string
  ratio: number
  copies: number
  dedup: string
  datasets: Dataset[]
}
export async function listPools() {
  const output = await runProcess(
    'zfs list -p -H -t all -o name,used,logicalused,avail,compression,ratio,copies,dedup'
  )
  console.log(output)
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
      ] = line.split('\t')
      const [pool, datasetSnapshot] = name.split('/')
      const [dataset, snapshot] = (datasetSnapshot ?? '').split('@')
      if (snapshot) {
        acc[pool].datasets.at(-1)?.snapshots.push({
          name: snapshot,
          used: +used,
        })
      } else if (dataset) {
        acc[pool].datasets.push({
          name: dataset,
          used: +used,
          logicalused: +logicalused,
          available: +available,
          compression,
          ratio: parseFloat(ratio),
          copies: parseInt(copies),
          dedup,
          snapshots: [],
        })
      } else if (pool) {
        acc[pool] = {
          name: pool,
          used: +used,
          logicalused: +logicalused,
          available: +available,
          compression,
          ratio: parseFloat(ratio),
          copies: parseInt(copies),
          dedup,
          datasets: [],
        }
      }
      return acc
    },
    {} as Record<string, PoolInfo>
  )
}
