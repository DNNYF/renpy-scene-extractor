import { FC } from 'react'

interface UserGuideProps {
    onClose: () => void
}

const SHORTCUTS = [
    { key: '↑ / ↓', desc: 'Navigate files (prev / next)' },
    { key: '← / →', desc: 'Navigate files (prev / next)' },
    { key: 'Q', desc: 'Add current file to play queue' },
    { key: '?', desc: 'Toggle this help guide' },
    { key: 'Ctrl+Click', desc: 'Toggle multi-select on a file' },
    { key: 'Shift+Click', desc: 'Range select files' },
]

const FEATURES = [
    { title: 'File Explorer', desc: 'Browse and preview files inside .rpa archives from Ren\'Py games. Use the sidebar to select a game folder.' },
    { title: 'Filters', desc: 'Filter files by type (All / Video / Image / Audio) using the filter buttons.' },
    { title: 'List & Grid View', desc: 'Toggle between list and grid view using the ☰ / ⊞ buttons.' },
    { title: 'Play Queue', desc: 'Build a custom playlist: Ctrl+Click files or press Q, then reorder by dragging. Toggle the queue with the ☰ button in the preview toolbar.' },
    { title: 'Auto-Play', desc: 'Enable "Auto" in the preview toolbar to automatically play the next file when media ends.' },
    { title: 'Extract', desc: 'Extract individual files, all filtered files, or all queued files to a folder of your choice.' },
    { title: 'Encryption Key', desc: 'Some archives require a hex key. Click the 🔑 button in the sidebar to enter it.' },
    { title: 'Timeline Editor', desc: 'Send queued files to a basic timeline editor for arranging clips, splitting, and adding external media.' },
]

export const UserGuide: FC<UserGuideProps> = ({ onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal guide-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>User Guide</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="guide-content">
                    <section className="guide-section">
                        <h3>⌨️ Keyboard Shortcuts</h3>
                        <table className="shortcuts-table">
                            <tbody>
                                {SHORTCUTS.map(s => (
                                    <tr key={s.key}>
                                        <td><kbd>{s.key}</kbd></td>
                                        <td>{s.desc}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="guide-section">
                        <h3>📖 Features</h3>
                        <div className="guide-features">
                            {FEATURES.map(f => (
                                <div key={f.title} className="guide-feature">
                                    <strong>{f.title}</strong>
                                    <p>{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
