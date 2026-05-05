import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Avatar from './Avatar';

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
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
  if (mimeType.startsWith('text/')) return '📃';
  return '📎';
}

export default function TaskAttachments({ groupId, taskId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentUserId = JSON.parse(localStorage.getItem('user') || '{}').id;

  useEffect(() => {
    loadAttachments();
  }, [groupId, taskId]);

  const loadAttachments = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/groups/${groupId}/tasks/${taskId}/attachments`);
      setAttachments(res.data);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      setAttachments([res.data, ...attachments]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attachmentId: number, filename: string) => {
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
  };

  const handleDelete = async (attachmentId: number) => {
    if (!confirm('Удалить файл?')) return;

    try {
      await apiClient.delete(`/api/groups/${groupId}/tasks/${taskId}/attachments/${attachmentId}`);
      setAttachments(attachments.filter(a => a.id !== attachmentId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось удалить файл');
    }
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-md)', color: 'var(--text-muted)' }}>Загрузка файлов...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {attachments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Файлов пока нет
          </p>
        ) : (
          attachments.map(attachment => (
            <div
              key={attachment.id}
              style={{
                padding: 'var(--space-sm)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                gap: 'var(--space-sm)',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '24px' }}>{getFileIcon(attachment.mime_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 2 }}>
                  <span
                    style={{
                      fontWeight: 500,
                      fontSize: 'var(--font-size-sm)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {attachment.original_filename}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>
                    {formatFileSize(attachment.file_size)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <Avatar src={attachment.avatar_url} name={attachment.display_name || attachment.username} size={16} />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    {attachment.display_name || attachment.username}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>•</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    {formatDate(attachment.created_at)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                  onClick={() => handleDownload(attachment.id, attachment.original_filename)}
                >
                  Скачать
                </button>
                {attachment.user_id === currentUserId && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', color: 'var(--danger)' }}
                    onClick={() => handleDelete(attachment.id)}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <label
          htmlFor={`file-upload-${taskId}`}
          className="btn btn-primary"
          style={{
            display: 'inline-block',
            fontSize: 'var(--font-size-sm)',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1
          }}
        >
          {uploading ? 'Загрузка...' : '📎 Прикрепить файл'}
        </label>
        <input
          id={`file-upload-${taskId}`}
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          style={{ display: 'none' }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
        />
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Максимальный размер: 10 МБ. Поддерживаются: изображения, PDF, документы, таблицы, архивы, текст.
        </p>
      </div>
    </div>
  );
}
