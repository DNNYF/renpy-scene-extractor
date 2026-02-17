import { FC, useState } from 'react'

interface KeyInputProps {
    currentKey: string
    onApply: (key: string) => void
    onClose: () => void
}

export const KeyInput: FC<KeyInputProps> = ({ currentKey, onApply, onClose }) => {
    const [key, setKey] = useState(currentKey)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onApply(key)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>🔐 Encryption Key</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <p className="modal-description">
                        Some Ren'Py games use custom encryption keys for their archives.
                        If the default key doesn't work, enter the hex key below.
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="encryption-key">Hex Key</label>
                            <input
                                id="encryption-key"
                                type="text"
                                className="form-input"
                                placeholder="e.g. 0xDEADBEEF or leave empty for default"
                                value={key}
                                onChange={e => setKey(e.target.value)}
                                autoFocus
                            />
                            <span className="form-hint">
                                Common default: <code>0xDEADBEEF</code>. Leave empty to use the archive's built-in key.
                            </span>
                        </div>

                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => { setKey(''); onApply(''); }}>
                                Clear Key
                            </button>
                            <button type="submit" className="btn btn-primary">
                                Apply Key
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
