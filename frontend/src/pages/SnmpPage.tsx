import { useState } from 'react'
import { snmpGet, SnmpGetResult } from '../utils/api'

export default function SnmpPage() {
  const [host, setHost]     = useState('ignored-host')
  const [oid, setOid]       = useState('1.3.6.1.2.1.1.1.0')
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const onFetch = async () => {
    setError('')
    setLoading(true)
    try {
      const r: SnmpGetResult = await snmpGet(host, oid)
      setResult(r.value)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2>Generic SNMP GET</h2>
      <div>
        Host: <input value={host} onChange={e => setHost(e.target.value)} /> &nbsp;
        OID:  <input value={oid}  onChange={e => setOid(e.target.value)} /> &nbsp;
        <button onClick={onFetch} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {result && <pre>Value: {result}</pre>}
      {error  && <pre style={{ color: 'red' }}>{error}</pre>}
    </>
  )
}
