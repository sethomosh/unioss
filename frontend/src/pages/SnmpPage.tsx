// frontend/src/pages/SnmpPage.tsx

import { useState } from 'react'
import { snmpGet, SnmpGetResult } from '../utils/api'

export default function SnmpPage() {
  // We hard‐code the SNMP‐Sim hostname here:
  const SNMP_SIM_HOST = 'snmpsim'
  const [oid, setOid]       = useState('1.3.6.1.2.1.1.1.0')
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const onFetch = async () => {
     console.log('SnmpPage.onFetch() triggered; about to call snmpGet()')
    setError('')
    setLoading(true)
    try {
      // Always request from SNMP‐Sim using port 1161:
      const r: SnmpGetResult = await snmpGet(SNMP_SIM_HOST, oid, undefined, 1161)
      setResult(r.value)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2>Generic SNMP GET</h2>
      <div>
        {/* Host is fixed to SNMP‐Sim */}
        Host: <input value={SNMP_SIM_HOST} disabled /> &nbsp;
        OID:  <input value={oid}  onChange={e => setOid(e.target.value)} /> &nbsp;
        <button onClick={onFetch} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
      {result && <pre>Value: {result}</pre>}
      {error  && <pre style={{ color: 'red' }}>SNMP GET failed: {error}</pre>}
    </>
  )
}
