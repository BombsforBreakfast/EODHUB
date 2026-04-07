export type RabbitholeTopic = {
  slug: string;
  name: string;
  description: string;
  subtopics: string[];
  tags: string[];
};

export type RabbitholeThread = {
  id: string;
  title: string;
  body: string;
  topicSlug: string;
  topicName: string;
  subtopic?: string;
  tags: string[];
  author: string;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
  isHighValue?: boolean;
};

export type RabbitholeReply = {
  id: string;
  threadId: string;
  author: string;
  body: string;
  createdAt: string;
};
