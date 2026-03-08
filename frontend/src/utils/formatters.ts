export function formatUptime(seconds: number | undefined | null): string {
    if (seconds == null || isNaN(seconds)) return '—';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);

    if (parts.length === 0) return '< 1m';
    return parts.join(' ');
}
