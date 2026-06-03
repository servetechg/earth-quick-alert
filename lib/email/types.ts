export type OperationalEmailAttachment = {
    filename: string;
    content: Buffer;
    contentType?: string;
};

export type OperationalEmailMessage = {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: OperationalEmailAttachment[];
};

export type EmailSendResult = {
    sent: boolean;
    error?: string;
    messageId?: string;
};

export type EmailBatchItemResult = EmailSendResult & {
    to: string;
};
