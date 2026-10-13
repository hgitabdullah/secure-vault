import { useDialogs, useUI } from '../stores/ui.js';
import PromptDialog from './ui/PromptDialog.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import ShareDialog from './ShareDialog.jsx';
import MoveDialog from './MoveDialog.jsx';
import DetailsPanel from './DetailsPanel.jsx';
import UploadModal from './UploadModal.jsx';

/** Renders whichever dialog is open (from useDialogs) plus the details panel and upload modal. */
export default function DialogHost({ folderId }) {
  const { dialog, close } = useDialogs();
  const uploadOpen = useUI((s) => s.uploadOpen);
  const C = { prompt: PromptDialog, confirm: ConfirmDialog, share: ShareDialog, move: MoveDialog }[dialog?.type];
  return (
    <>
      <DetailsPanel />
      {uploadOpen && <UploadModal folderId={folderId} />}
      {C && <C {...dialog.props} onClose={close} />}
    </>
  );
}
