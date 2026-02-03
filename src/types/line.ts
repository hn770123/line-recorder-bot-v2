/**
 * @file LINE webhookイベントの型定義
 * @description LINE Messaging APIから送信されるWebhookイベントのTypeScript型を定義します。
 *              参照: https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects
 */

/**
 * @interface WebhookEvent
 * @description すべてのWebhookイベントオブジェクトの共通プロパティ
 */
export interface WebhookEvent {
  replyToken?: string; // Reply token for reply API
  type: 'message' | 'follow' | 'unfollow' | 'join' | 'leave' | 'postback' | 'beacon' | 'accountLink' | 'memberJoined' | 'memberLeft' | 'things' | 'unsend' | 'videoPlayComplete' | 'scenarioResult' | 'pinocchioAudio' | 'chatControl' | 'agreements';
  mode: 'active' | 'standby'; // Channel state
  timestamp: number; // Time of the event in milliseconds
  source: UserSource | GroupSource | RoomSource; // Source of the event
}

/**
 * @interface EventSource
 * @description イベントソースの共通インターフェース
 */
export interface EventSource {
  type: 'user' | 'group' | 'room';
  userId: string;
}

/**
 * @interface UserSource
 * @description ユーザーからのイベントソース
 */
export interface UserSource extends EventSource {
  type: 'user';
}

/**
 * @interface GroupSource
 * @description グループからのイベントソース
 */
export interface GroupSource extends EventSource {
  type: 'group';
  groupId: string;
}

/**
 * @interface RoomSource
 * @description ルームからのイベントソース
 */
export interface RoomSource extends EventSource {
  type: 'room';
  roomId: string;
}

/**
 * @interface MessageEvent
 * @description メッセージイベントオブジェクト
 */
export interface MessageEvent extends WebhookEvent {
  type: 'message';
  message: TextMessage | ImageMessage | VideoMessage | AudioMessage | FileMessage | LocationMessage | StickerMessage;
}

/**
 * @interface Message
 * @description メッセージオブジェクトの共通プロパティ
 */
export interface Message {
  id: string; // Message ID
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker';
}

/**
 * @interface TextMessage
 * @description テキストメッセージオブジェクト
 */
export interface TextMessage extends Message {
  type: 'text';
  text: string; // Message text
  emojis?: { index: number; length: number; productId: string; emojiId: string; }[];
  mention?: {
    mentionees: {
      index: number;
      length: number;
      userId: string;
      type: 'user';
    }[];
  };
}

/**
 * @interface ImageMessage
 * @description 画像メッセージオブジェクト
 */
export interface ImageMessage extends Message {
  type: 'image';
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
    previewImageUrl?: string;
  };
  imageSet?: {
    id: string;
    index: number;
    total: number;
  };
}

/**
 * @interface VideoMessage
 * @description 動画メッセージオブジェクト
 */
export interface VideoMessage extends Message {
  type: 'video';
  duration: number; // Message duration in milliseconds
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
    previewImageUrl?: string;
  };
  // Other video message properties
}

/**
 * @interface AudioMessage
 * @description 音声メッセージオブジェクト
 */
export interface AudioMessage extends Message {
  type: 'audio';
  duration: number; // Message duration in milliseconds
  contentProvider: {
    type: 'line' | 'external';
    originalContentUrl?: string;
    previewImageUrl?: string;
  };
  // Other audio message properties
}

/**
 * @interface FileMessage
 * @description ファイルメッセージオブジェクト
 */
export interface FileMessage extends Message {
  type: 'file';
  fileName: string; // File name
  fileSize: number; // File size in bytes
}

/**
 * @interface LocationMessage
 * @description 位置情報メッセージオブジェクト
 */
export interface LocationMessage extends Message {
  type: 'location';
  title?: string; // Title
  address?: string; // Address
  latitude: number; // Latitude
  longitude: number; // Longitude
}

/**
 * @interface StickerMessage
 * @description スタンプメッセージオブジェクト
 */
export interface StickerMessage extends Message {
  type: 'sticker';
  packageId: string; // Package ID
  stickerId: string; // Sticker ID
  stickerResourceType?: 'STATIC' | 'ANIMATION' | 'SOUND' | 'ANIMATION_SOUND' | 'POPUP' | 'POPUP_SOUND';
  keywords?: string[];
  text?: string;
}

/**
 * @interface PostbackEvent
 * @description ポストバックイベントオブジェクト
 */
export interface PostbackEvent extends WebhookEvent {
  type: 'postback';
  postback: {
    data: string; // Postback data
    params?: {
      datetime?: string;
      date?: string;
      time?: string;
    };
  };
}

/**
 * @interface FollowEvent
 * @description フォローイベントオブジェクト
 */
export interface FollowEvent extends WebhookEvent {
  type: 'follow';
}

/**
 * @interface UnfollowEvent
 * @description アンフォローイベントオブジェクト
 */
export interface UnfollowEvent extends WebhookEvent {
  type: 'unfollow';
}

/**
 * @interface JoinEvent
 * @description 参加イベントオブジェクト (グループ/ルームにbotが追加された場合)
 */
export interface JoinEvent extends WebhookEvent {
  type: 'join';
}

/**
 * @interface LeaveEvent
 * @description 退出イベントオブジェクト (グループ/ルームからbotが削除された場合)
 */
export interface LeaveEvent extends WebhookEvent {
  type: 'leave';
}

/**
 * @interface MemberJoinedEvent
 * @description メンバー参加イベントオブジェクト (グループ/ルームにメンバーが追加された場合)
 */
export interface MemberJoinedEvent extends WebhookEvent {
  type: 'memberJoined';
  joined: {
    members: (UserSource | GroupSource | RoomSource)[];
  };
}

/**
 * @interface MemberLeftEvent
 * @description メンバー退出イベントオブジェクト (グループ/ルームからメンバーが削除された場合)
 */
export interface MemberLeftEvent extends WebhookEvent {
  type: 'memberLeft';
  left: {
    members: (UserSource | GroupSource | RoomSource)[];
  };
}
