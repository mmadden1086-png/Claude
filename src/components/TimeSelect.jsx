import { useMemo } from 'react'
import { generateTimeOptions, normalizeTimeValue } from '../lib/format'

export function TimeSelect({ value, onChange, className = '', disabled = false }) {
  const options = useMemo(() => generateTimeOptions(), [])
  const normalizedValue = normalizeTimeValue(value)

  return (
    <select
      className={className}
      disabled={disabled}
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No time</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
