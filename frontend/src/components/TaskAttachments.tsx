import { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

interface Attachment {
  id: number;
  task_id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface TaskAttachmentsProps {
  groupId: number;
  taskId: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(dateStr: string) {
  const utc = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(utc).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

interface FileMeta {
  icon: JSX.Element;
  color: string;
  label: string;
}

function getFileMeta(mime: string, name: string): FileMeta {
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (mime.startsWith('image/')) {
    return {
      color: '#10B981',
      label: 'IMG',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      )
    };
  }
  if (mime === 'application/pdf') {
    return {
      color: '#EF4444',
      label: 'PDF',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      )
    };
  }
  if (mime.includes('word') || ext === 'doc' || ext === 'docx') {
    return {
      color: '#2563EB',
      label: 'DOC',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
      )
    };
  }
  if (mime.includes('excel') || mime.includes('spreadsheet') || ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return {
      color: '#10B981',
      label: 'XLS',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="16" y2="17"/>
          <line x1="12" y1="11" x2="12" y2="19"/>
        </svg>
      )
    };
  }
  if (mime.includes('zip') || mime.includes('compressed') || ext === 'zip' || ext === 'rar' || ext === '7z') {
    return {
      color: '#F59E0B',
      label: 'ZIP',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        </svg>
      )
    };
  }
  return {
    color: '#6B7280',
    label: ext.toUpperCase() || 'FILE',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    )
  };
}

export default function TaskAttachments({ groupId, taskId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = JSON.parse(localStorage.getItem('user') || '{}').id;

  useEffect(() => { loadAttachments(); /* eslint-disable-next-line */ }, [groupId, taskId]);

  async function loadAttachments() {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/groups/${groupId}/tasks/${taskId}/attachments`);
      setAttachments(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function uploadFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      alert('Размер файла не должен превышать 10 МБ');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post(`/api/groups/${groupId}/tasks/${taskId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAttachments(prev => [res.data, ...prev]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function handleDownload(attachmentId: number, filename: string) {
    try {
      const res = await apiClient.get(
        `/api/groups/${groupId}/tasks/${taskId}/attachments/${attachmentId}/download`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось скачать файл');
    }
  }

  async function handleDelete(attachmentId: number) {
    if (!confirm('Удалить файл?')) return;
    try {
      await apiClient.delete(`/api/groups/${groupId}/tasks/${taskId}/attachments/${attachmentId}`);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось удалить файл');
    }
  }

  return (
    <div className="attachments">
      {/* Drop zone */}
      <div
        className={`attach-dropzone ${dragActive ? 'attach-dropzone--active' : ''} ${uploading ? 'attach-dropzone--uploading' : ''}`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="attach-dropzone__icon">
          {uploading ? (
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          )}
        </div>
        <div className="attach-dropzone__text">
          {uploading
            ? 'Загрузка...'
            : <>Перетащите файл сюда или <span>выберите</span></>
          }
        </div>
        <div className="attach-dropzone__hint">
          до 10 МБ · изображения, PDF, документы, архивы
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          style={{ display: 'none' }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="attachments__skeleton">
          {[1, 2].map(i => (
            <div key={i} className="attach-skeleton">
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton skeleton-bar" style={{ width: '60%' }} />
                <div className="skeleton skeleton-bar" style={{ width: '35%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : attachments.length === 0 ? (
        <div className="empty-illustration">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-illustration__svg">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <div className="empty-illustration__title">Пока нет файлов</div>
          <div className="empty-illustration__desc">Прикрепите документы, картинки или архивы</div>
        </div>
      ) : (
        <div className="attachments__list">
          {attachments.map(att => {
            const meta = getFileMeta(att.mime_type, att.original_filename);
            return (
              <div key={att.id} className="attach-item">
                <div
                  className="attach-item__icon"
                  style={{ background: `${meta.color}1F`, color: meta.color }}
                >
                  {meta.icon}
                </div>
                <div className="attach-item__info">
                  <div className="attach-item__name" title={att.original_filename}>
                    {att.original_filename}
                  </div>
                  <div className="attach-item__meta">
                    <span className="attach-item__tag" style={{ background: `${meta.color}1F`, color: meta.color }}>
                      {meta.label}
                    </span>
                    <span>{formatFileSize(att.file_size)}</span>
                    <span>·</span>
                    <span>{att.display_name || att.username}</span>
                    <span>·</span>
                    <span>{formatDate(att.created_at)}</span>
                  </div>
                </div>
                <div className="attach-item__actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Скачать"
                    onClick={() => handleDownload(att.id, att.original_filename)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                  {att.user_id === currentUserId && (
                    <button
                      type="button"
                      className="btn btn-danger btn-icon"
                      title="Удалить"
                      onClick={() => handleDelete(att.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
