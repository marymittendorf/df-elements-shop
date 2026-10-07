// Builds a CSV file (Excel friendly) and downloads it
export function downloadCSV(filename, header, rows) {
  const cell = v => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const text = [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// yyyy-mm-dd in South African time
export const ymd = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
export const n2 = v => (Math.round(Number(v || 0) * 100) / 100).toFixed(2)
