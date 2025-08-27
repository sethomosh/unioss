import React from 'react';


export const StatusCard: React.FC<{ title: string; value: React.ReactNode; remark?: string }> = ({ title, value, remark }) => {
return (
<div className="p-4 bg-card rounded-lg shadow-sm border border-muted">
<div className="text-xs text-muted uppercase tracking-wide">{title}</div>
<div className="mt-2 text-2xl font-bold">{value}</div>
{remark && <div className="mt-2 text-sm text-muted">{remark}</div>}
</div>
);
};