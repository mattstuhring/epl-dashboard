/**
 * Own editable supporter identity and its browser-local persistence, separate from club data.
 */
import { useEffect, useState } from 'react'
import { readPreference, savePreference } from '../preferences'

/**
 * Restore validated identity defaults and save edits without requiring browser storage.
 * @returns Surname and two-digit shirt-number state with controlled-input setters.
 * Notes: Empty strings are intentional and hide their corresponding signature text.
 */
export function useSupporterSignature() {
  const [surname, setSurname] = useState(() =>
    readPreference('epl.supporterSurname', 'STUHRING').slice(0, 24),
  )
  const [number, setNumber] = useState(() => {
    const saved = readPreference('epl.supporterNumber', '9')
    return /^\d{0,2}$/.test(saved) ? saved : '9'
  })

  useEffect(() => {
    savePreference('epl.supporterSurname', surname)
    savePreference('epl.supporterNumber', number)
  }, [surname, number])

  return { surname, setSurname, number, setNumber }
}
