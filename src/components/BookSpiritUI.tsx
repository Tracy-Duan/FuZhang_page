import { createPortal } from 'react-dom'
import { AccountControl } from './AccountControl'
import { CompanionChat } from './CompanionChat'
import { BookSpiritAtmosphere } from './BookSpiritAtmosphere'
import { PetSpeech } from './PetSpeech'
import { useAuth } from './auth'
import { useBookSpirit } from './bookSpiritStore'
import { SettingsDialog } from './settings/SettingsDialog'

export function BookSpiritUI() {
  const { isAuthenticated } = useAuth()
  const { settingsOpen } = useBookSpirit()
  return createPortal(<>
    {isAuthenticated ? <><CompanionChat /><BookSpiritAtmosphere /><PetSpeech /></> : null}
    <AccountControl />
    {isAuthenticated && settingsOpen ? <SettingsDialog /> : null}
  </>, document.body)
}
