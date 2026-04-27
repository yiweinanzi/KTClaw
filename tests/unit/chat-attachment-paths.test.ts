import { describe, expect, it } from 'vitest';
import {
  enrichWithToolResultFiles,
  extractMediaRefs,
  extractRawFilePaths,
} from '@/stores/chat/helpers';
import { extractMediaRefs as extractMessageMediaRefs } from '@/pages/Chat/message-utils';
import type { RawMessage } from '@/stores/chat';

describe('chat attachment path parsing', () => {
  it('keeps spaces in media marker paths', () => {
    const text = '[media attached: /home/user/My Photos/cat face.jpg (image/jpeg) | /home/user/My Photos/cat face.jpg]';

    expect(extractMediaRefs(text)).toEqual([
      {
        filePath: '/home/user/My Photos/cat face.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
  });

  it('keeps spaces in raw Unix and Windows file paths', () => {
    const text = [
      'Saved image at /home/user/My Photos/cat face.jpg',
      'Windows copy: C:\\Users\\me\\My Pictures\\meeting screenshot.png',
    ].join('\n');

    expect(extractRawFilePaths(text)).toEqual([
      {
        filePath: '/home/user/My Photos/cat face.jpg',
        mimeType: 'image/jpeg',
      },
      {
        filePath: 'C:\\Users\\me\\My Pictures\\meeting screenshot.png',
        mimeType: 'image/png',
      },
    ]);
  });

  it('keeps spaces in rendered message media references', () => {
    const message: RawMessage = {
      role: 'user',
      content: '[media attached: C:\\Users\\me\\My Pictures\\avatar photo.png (image/png) | C:\\Users\\me\\My Pictures\\avatar photo.png]',
    };

    expect(extractMessageMediaRefs(message)).toEqual([
      {
        filePath: 'C:\\Users\\me\\My Pictures\\avatar photo.png',
        mimeType: 'image/png',
      },
    ]);
  });

  it('does not carry orphan tool-result images across a new user turn', () => {
    const messages: RawMessage[] = [
      {
        role: 'toolresult',
        content: 'Found old image: C:\\Users\\me\\Pictures\\old-cat.png',
      },
      {
        role: 'user',
        content: '帮我搜索一张企鹅的图片',
      },
      {
        role: 'assistant',
        content: 'No matching images found.',
      },
    ];

    const enriched = enrichWithToolResultFiles(messages);

    expect(enriched[2]._attachedFiles).toBeUndefined();
  });
});
