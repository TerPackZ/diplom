# Функционал обмена данными

## Описание

Реализован полноценный функционал для совместной работы над задачами:
- **Комментарии** — обсуждение задач в реальном времени
- **Файлы** — прикрепление документов, изображений и других файлов к задачам

## Возможности

### Комментарии к задачам

- Добавление комментариев к любой задаче
- Редактирование своих комментариев
- Удаление своих комментариев (или модераторами/лидерами)
- Отображение автора и времени создания
- Индикация отредактированных комментариев

### Прикрепление файлов

- Загрузка файлов до 10 МБ
- Поддерживаемые форматы:
  - Изображения: JPEG, PNG, GIF, WebP
  - Документы: PDF, DOC, DOCX, XLS, XLSX
  - Архивы: ZIP
  - Текст: TXT, CSV
- Скачивание прикрепленных файлов
- Удаление своих файлов (или модераторами/лидерами)
- Отображение информации о файле (размер, автор, дата)

## Как использовать

1. Откройте любую задачу в группе
2. В модальном окне задачи переключайтесь между вкладками:
   - **Детали** — основная информация о задаче
   - **Комментарии** — обсуждение задачи
   - **Файлы** — прикрепленные документы

### Добавление комментария

1. Перейдите на вкладку "Комментарии"
2. Введите текст в поле внизу
3. Нажмите "Отправить"

### Загрузка файла

1. Перейдите на вкладку "Файлы"
2. Нажмите "📎 Прикрепить файл"
3. Выберите файл на компьютере
4. Файл автоматически загрузится

## API Endpoints

### Комментарии

- `GET /api/groups/:groupId/tasks/:taskId/comments` — получить все комментарии
- `POST /api/groups/:groupId/tasks/:taskId/comments` — добавить комментарий
- `PUT /api/groups/:groupId/tasks/:taskId/comments/:commentId` — редактировать комментарий
- `DELETE /api/groups/:groupId/tasks/:taskId/comments/:commentId` — удалить комментарий

### Файлы

- `GET /api/groups/:groupId/tasks/:taskId/attachments` — получить все файлы
- `POST /api/groups/:groupId/tasks/:taskId/attachments` — загрузить файл
- `GET /api/groups/:groupId/tasks/:taskId/attachments/:attachmentId/download` — скачать файл
- `DELETE /api/groups/:groupId/tasks/:taskId/attachments/:attachmentId` — удалить файл

## Структура базы данных

### Таблица task_comments

```sql
CREATE TABLE task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Таблица task_attachments

```sql
CREATE TABLE task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Безопасность

- Все операции требуют аутентификации
- Доступ к комментариям и файлам имеют только члены группы
- Редактировать/удалять можно только свои комментарии и файлы
- Лидеры и модераторы могут удалять любые комментарии и файлы
- Файлы проверяются на тип и размер
- Загруженные файлы хранятся в защищенной директории `uploads/attachments/`
