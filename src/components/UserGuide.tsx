import { FC } from 'react'

interface UserGuideProps {
    onClose: () => void
}

const SHORTCUTS = [
    { key: '↑ / ↓', desc: 'Navigate the last file or queue target (prev / next)' },
    { key: '← / →', desc: 'Navigate the last file or queue target (prev / next)' },
    { key: 'Q', desc: 'Import all selected files to play queue' },
    { key: '?', desc: 'Toggle this help guide' },
    { key: 'Ctrl+Click', desc: 'Toggle multi-select on a file' },
    { key: 'Shift+Click', desc: 'Range select files' },
    { key: 'Space', desc: 'Play / pause the timeline editor' },
    { key: 'S', desc: 'Split the selected clip at the playhead' },
    { key: 'D', desc: 'Duplicate the selected clip in the timeline editor' },
    { key: 'Alt+← / →', desc: 'Move the selected timeline clip earlier or later' },
    { key: 'Delete', desc: 'Delete the selected timeline clip and close the gap' },
]

const FEATURES = [
    { title: 'File Explorer', desc: 'Browse and preview files inside .rpa archives from Ren\'Py games. Use the sidebar to select a game folder.' },
    { title: 'Filters', desc: 'Filter files by type (All / Video / Image / Audio) using the filter buttons.' },
    { title: 'List & Grid View', desc: 'Toggle between list and grid view using the ☰ / ⊞ buttons.' },
    { title: 'Play Queue', desc: 'Build a custom playlist: Ctrl+Click or Shift+Click files, then press Q or click “Queue Selected” to import them all into the play queue. Reorder by dragging, set loop counts per item, and use queue interactions to make arrow keys follow the queue.' },
    { title: 'Auto-Play', desc: 'Enable "Auto" in the preview toolbar to automatically replay queued items until their loop count is exhausted before advancing to the next item.' },
    { title: 'Extract', desc: 'Use “Extract Selected” to download all selected files, “Extract All” to download everything in the current filter tab, or “Extract” in the queue/preview to save the active media.' },
    { title: 'Encryption Key', desc: 'Some archives require a hex key. Click the 🔑 button in the sidebar to enter it.' },
    { title: 'Timeline Editor', desc: 'Send queued files to the timeline editor for arranging clips, splitting, duplicating with D, nudging the selected clip earlier or later with Alt+← / →, closing gaps automatically after delete, manually shifting clips left with Close Gaps, and adding external media.' },
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
