import { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { Alert } from '../types/types';

const getSeverityStyles = (level: string) => {
    switch (level.toLowerCase()) {
        case 'critical': return 'text-rose-600 bg-rose-500/10 border-rose-500/20 px-2.5 py-1 rounded-lg';
        case 'high': return 'text-orange-600 bg-orange-500/10 border-orange-500/20 px-2.5 py-1 rounded-lg';
        case 'warning': return 'text-amber-600 bg-amber-500/10 border-amber-500/20 px-2.5 py-1 rounded-lg';
        default: return 'text-sky-600 bg-sky-500/10 border-sky-500/20 px-2.5 py-1 rounded-lg';
    }
};

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterSeverity, setFilterSeverity] = useState('all');
    const [filterAck, setFilterAck] = useState('active');

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const respArr = await apiService.getAlerts(100);
            setAlerts(respArr);
        } catch (err) {
            console.error('Failed to load alerts', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleAcknowledge = async (id: number | string) => {
        try {
            await apiService.acknowledgeAlert(id.toString());
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        } catch (e) {
            console.error('failed to acknowledge', e);
        }
    };

    const handleAcknowledgeAll = async () => {
        const active = alerts.filter(a => !a.acknowledged);
        if (active.length === 0) return;

        if (confirm(`Acknowledge all ${active.length} active alerts?`)) {
            for (const a of active) {
                await handleAcknowledge(a.id);
            }
        }
    };

    const filteredAlerts = alerts.filter(a => {
        if (filterSeverity !== 'all' && a.severity?.toLowerCase() !== filterSeverity.toLowerCase()) return false;
        if (filterAck === 'active' && a.acknowledged) return false;
        if (filterAck === 'acknowledged' && !a.acknowledged) return false;
        return true;
    });

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-1.5 h-8 bg-rose-500 rounded-full"></div>
                        <h1 className="text-3xl font-black tracking-tight text-foreground uppercase">Network Intelligence</h1>
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest pl-4">Real-time system anomalies & ACL breach monitoring</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchAlerts}
                        className="px-6 py-2 rounded-xl bg-muted/40 border border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all duration-300"
                    >
                        Rescan
                    </button>
                    <button
                        onClick={handleAcknowledgeAll}
                        className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                        Clear Active
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">Status Protocol</label>
                    <select
                        value={filterAck}
                        onChange={(e) => setFilterAck(e.target.value)}
                        className="w-full p-4 bg-muted/20 border border-border/40 rounded-2xl text-[11px] font-bold uppercase tracking-wider focus:ring-0 focus:border-primary transition-all cursor-pointer"
                    >
                        <option value="active">Active Alerts</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="all">Full History</option>
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">Severity Tier</label>
                    <select
                        value={filterSeverity}
                        onChange={(e) => setFilterSeverity(e.target.value)}
                        className="w-full p-4 bg-muted/20 border border-border/40 rounded-2xl text-[11px] font-bold uppercase tracking-wider focus:ring-0 focus:border-primary transition-all cursor-pointer"
                    >
                        <option value="all">Global (All)</option>
                        <option value="critical">Critical Only</option>
                        <option value="high">High Tier</option>
                        <option value="warning">Warning Threshold</option>
                        <option value="info">General Info</option>
                    </select>
                </div>
            </div>

            <div className="bg-card/40 border border-border/40 rounded-2xl shadow-sm backdrop-blur-md overflow-hidden transition-all duration-300 hover:shadow-md">
                {loading && alerts.length === 0 ? (
                    <div className="flex items-center justify-center p-32">
                        <div className="flex space-x-1.5">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                        </div>
                    </div>
                ) : filteredAlerts.length === 0 ? (
                    <div className="p-32 text-center group">
                        <div className="w-16 h-16 bg-muted/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/30 group-hover:scale-110 transition-transform duration-500">
                            <svg className="w-8 h-8 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Clear Horizon</div>
                        <p className="text-[11px] text-muted-foreground/60 max-w-[200px] mx-auto leading-relaxed">System status optimal. No alerts matching current filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/30 border-b border-border/40 text-muted-foreground uppercase tracking-widest text-[10px] font-black">
                                    <th className="px-8 py-5">Origin</th>
                                    <th className="px-8 py-5">Temporal</th>
                                    <th className="px-8 py-5">Intelligence</th>
                                    <th className="px-8 py-5 text-right">Operation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {filteredAlerts.map(alert => (
                                    <tr key={alert.id} className="group hover:bg-primary/[0.02] transition-colors">
                                        <td className="px-8 py-5 whitespace-nowrap">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${getSeverityStyles(alert.severity || 'info')}`}>
                                                {alert.severity}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 whitespace-nowrap text-muted-foreground font-mono">
                                            {new Date(alert.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="text-foreground font-bold tracking-tight mb-1 group-hover:text-primary transition-colors">{alert.message}</div>
                                            {alert.category && (
                                                <div className="flex items-center gap-1.5 opacity-60">
                                                    <div className="w-1 h-3 bg-primary rounded-full"></div>
                                                    <div className="text-[10px] text-primary font-bold uppercase tracking-wider">{alert.category}</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            {!alert.acknowledged ? (
                                                <button
                                                    onClick={() => handleAcknowledge(alert.id)}
                                                    className="px-4 py-1.5 rounded-lg border border-primary/40 text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                                                >
                                                    Dismiss
                                                </button>
                                            ) : (
                                                <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    Logged
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
