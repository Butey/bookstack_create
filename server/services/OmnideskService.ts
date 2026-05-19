import axios from 'axios';

export class OmnideskService {
  private cleanHtml(html: any): string {
    if (!html || typeof html !== 'string') return String(html || '');
    return html
      // Заменяем картинки на текстовый маркер перед удалением остальных тегов
      .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '[Изображение: $1]')
      .replace(/<img[^>]*>/gi, '[Изображение]')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  public async getTicket(domain: string, email: string, apiKey: string, ticketId: string): Promise<{ content: string; attachments: { name: string; mimeType: string; data: string }[] }> {
    const url = `https://${domain}.omnidesk.ru/api/cases/${ticketId}.json`;
    const authString = Buffer.from(`${email}:${apiKey}`).toString('base64');
    const attachmentsOutput: { name: string; mimeType: string; data: string }[] = [];
    
    try {
      const resp = await axios.get(url, {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Accept': 'application/json'
        }
      });

      const data = resp.data;
      if (!data || !data.case) {
        throw new Error('Некорректный ответ от Omnidesk API');
      }
      
      const caseData = data.case;
      const actualCaseId = caseData.case_id || ticketId;
      const actualCaseNumber = caseData.case_number || 'N/A';
      
      let textContent = `Omnidesk Ticket: Введенный ID #${ticketId} -> Загружен Case ID #${actualCaseId} (Номер #${actualCaseNumber})\n`;
      textContent += `ТЕМА: ${caseData.subject || 'Без темы'}\n`;
      
      const messagesUrl = `https://${domain}.omnidesk.ru/api/cases/${actualCaseId}/messages.json`;
      const messagesResp = await axios.get(messagesUrl, {
        params: {
          limit: 100,
          page: 1
        },
        headers: {
          'Authorization': `Basic ${authString}`,
          'Accept': 'application/json'
        }
      });
      
      // 1. Нормализуем массив сообщений
      let messagesList: any[] = [];
      const rawData = messagesResp.data;

      // 1. Извлекаем сообщения глубоким обходом (Deep Traversal),
      // чтобы игнорировать любые изменения структуры API (массивы, объекты с индексами и т.д.)
      const extractMessagesDeep = (obj: any, extracted: any[] = []) => {
        if (!obj || typeof obj !== 'object') return extracted;
        
        // Массивы обходим
        if (Array.isArray(obj)) {
          for (const item of obj) {
            extractMessagesDeep(item, extracted);
          }
          return extracted;
        }

        // Если это объект, может быть он сам является оберткой ({"message": {...}}) 
        // или самим сообщением, проверяем ключи:
        
        // Типичные признаки сообщения: наличие тела и даты
        const hasText = obj.content !== undefined || obj.html_content !== undefined || obj.content_html !== undefined || obj.body !== undefined || obj.text !== undefined;
        const hasDate = Boolean(obj.created_at);
        const hasAttachments = obj.attachments && Array.isArray(obj.attachments);

        // Если это сообщение напрямую, добавляем его:
        if ((hasText || hasAttachments) && hasDate) {
           // Чтобы определить роль, берем её из _derived_role или пробуем определить
           let role = obj._derived_role || 'Пользователь';
           // Если не было обертки, но есть id специфичные
           if (!obj._derived_role) {
               if (obj.staff_reply_id || obj.staff_id) role = 'Сотрудник';
               else if (obj.note_id) role = 'Заметка (Внутренняя)';
               else if (obj.system_message_id) role = 'Система';
           }
           
           extracted.push({
             ...obj,
             _derived_role: role
           });
        } else {
           // Если это не сообщение, обходим все вложенные свойства
           for (const key of Object.keys(obj)) {
             // Чтобы сохранить роль из ключа обертки (напр. "staff_reply": {...})
             const child = obj[key];
             if (child && typeof child === 'object') {
               // Передаем роль внутрь, если можем
               if (!Array.isArray(child) && !child._derived_role) {
                  let roleStr = '';
                  if (key.includes('staff_reply')) roleStr = 'Сотрудник';
                  else if (key.includes('note')) roleStr = 'Заметка (Внутренняя)';
                  else if (key.includes('system_message')) roleStr = 'Система';
                  else if (key === 'message') roleStr = 'Пользователь';
                  else if (key.endsWith('_message')) roleStr = `Пользователь (${key.replace('_message', '')})`;
                  
                  if (roleStr) {
                     child._derived_role = roleStr;
                  }
               }
               extractMessagesDeep(child, extracted);
             }
           }
        }
        return extracted;
      };

      messagesList = extractMessagesDeep(rawData);

      // Убираем дубликаты по ID, если структура случайно их задвоила
      const uniqueMessages = new Map();
      messagesList.forEach(m => {
         // Ищем конкретные ID сообщения
         const id = m.message_id || m.staff_reply_id || m.note_id || m.id || Math.random().toString();
         if (!uniqueMessages.has(id)) {
            uniqueMessages.set(id, m);
         }
      });
      messagesList = Array.from(uniqueMessages.values());

      // 2. Унифицируем объекты сообщений
      let processedMessages: any[] = [];
      let debugText = '';
      const attachmentTasks: any[] = [];
      
      if (messagesList.length === 0) {
         debugText += `ВНИМАНИЕ: Не удалось извлечь сообщения. Ответ API (первые 500 симв): ${JSON.stringify(rawData).substring(0, 500)}\n`;
         debugText += `Использован URL: ${messagesUrl}\n`;
      }
      
      messagesList.forEach((payload: any, index: number) => {
        // Попытка безопасно распарсить дату
        let timestamp = 0;
        if (payload.created_at) {
          const parsed = Date.parse(payload.created_at);
          if (!isNaN(parsed)) {
             timestamp = parsed;
          }
        }

        let attachmentsText = '';
        if (payload.attachments && Array.isArray(payload.attachments)) {
           const attachNames = payload.attachments.map((a: any) => {
               const attach = a.attachment || a;
               
               if (attach.url && attach.file_name && attach.mime_type) {
                 if (attach.mime_type.startsWith('image/') || attach.mime_type === 'application/pdf') {
                   attachmentTasks.push(attach);
                 }
               }

               return attach.file_name || 'файл';
           });
           if (attachNames.length > 0) {
               attachmentsText = `\n[Вложения: ${attachNames.join(', ')}]`;
           }
        }

        let content = this.cleanHtml(payload.content || payload.html_content || payload.content_html || payload.body || payload.text || '');
        if (attachmentsText) {
            content += attachmentsText;
        }

        processedMessages.push({
          id: payload.message_id || payload.staff_reply_id || payload.note_id || payload.id || Math.random().toString(),
          content: content,
          created_at: payload.created_at || '',
          timestamp: timestamp,
          role: payload._derived_role || 'Пользователь'
        });
      });

      // 3. Сортируем сообщения в хронологическом порядке (сначала старые, потом новые)
      // Если даты отсутствуют или не распознаны (timestamp === 0), оставляем порядок ключей, но убеждаемся, что он нужный (reversing if needed, but let's assume Omnidesk order is correct if we sort by timestamp)
      processedMessages.sort((a: any, b: any) => {
         if (a.timestamp && b.timestamp) {
            return a.timestamp - b.timestamp;
         }
         return 0; 
      });

      // 4. Формируем итоговый текст
      const caseContentCleaned = caseData.content ? this.cleanHtml(caseData.content) : '';
      const firstMessageContent = processedMessages[0]?.content;
      
      // Если самое первое сообщение отличается от контента самого тикета, то добавим контент тикета как Инициатора
      if (caseContentCleaned && caseContentCleaned !== firstMessageContent) {
        textContent += `\n[${caseData.created_at || ''}] Инициатор (Начальное сообщение):\n${caseContentCleaned}\n`;
        textContent += `\n${'='.repeat(40)}\n`;
      }

      // 5. Выводим всю историю переписки
      processedMessages.forEach(m => {
        textContent += `\n[${m.created_at}] ${m.role}:\n${m.content}\n`;
        textContent += `\n${'-'.repeat(20)}\n`;
      });
      
      if (debugText) {
          textContent += `\n${'='.repeat(40)}\nDEBUG INFO:\n${debugText}\n`;
      }

      // 6. Загружаем вложения
      if (attachmentTasks.length > 0) {
        const limitedTasks = attachmentTasks.slice(0, 10); // limited to 10
        await Promise.all(limitedTasks.map(async (attach) => {
          try {
            const fileResp = await axios.get(attach.url, { responseType: 'arraybuffer' });
            if (fileResp.data) {
              const base64 = Buffer.from(fileResp.data, 'binary').toString('base64');
              attachmentsOutput.push({
                name: attach.file_name,
                mimeType: attach.mime_type,
                data: base64
              });
            }
          } catch (attErr) {
            console.error(`Failed to download attachment ${attach.file_name}:`, attErr);
          }
        }));
      }

      return { content: textContent.trim(), attachments: attachmentsOutput };
    } catch (e: any) {
      console.error('Omnidesk error:', e?.response?.data || e.message);
      throw new Error(`Ошибка загрузки тикета из Omnidesk: ${e.message}`);
    }
  }
}
