import { ConnectButton } from '@rainbow-me/rainbowkit'
import { isMiniPayBrowser } from '../hooks/useMiniPay'

// Botón de wallet estilizado para el header de la app (diseño negro/lima)
export function WalletButton() {
  // Dentro de MiniPay no se muestra el botón — la wallet se conecta automáticamente
  if (isMiniPayBrowser()) return null

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) return null

        if (!account) {
          return (
            <button className="back-btn" onClick={openConnectModal}>
              Wallet
            </button>
          )
        }

        if (chain?.unsupported) {
          return (
            <button
              className="back-btn"
              onClick={openChainModal}
              style={{ color: 'var(--gold)', borderColor: 'rgba(255,194,75,.4)' }}
            >
              Red incorrecta
            </button>
          )
        }

        return (
          <button
            className="back-btn"
            onClick={openAccountModal}
            style={{ color: 'var(--win)', borderColor: 'rgba(55,226,154,.35)', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <span
              style={{
                width: 6, height: 6,
                background: 'var(--win)',
                borderRadius: '50%',
                boxShadow: '0 0 6px var(--win)',
                flexShrink: 0,
              }}
            />
            {account.displayName}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}
