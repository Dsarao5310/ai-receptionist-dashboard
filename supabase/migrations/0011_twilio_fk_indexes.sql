-- Migration 0009 introduced these nullable relationships after the original
-- foreign-key index hardening pass. Cover them explicitly so deletes/updates of
-- a conversation or customer do not require a full SMS-message scan.

create index if not exists sms_messages_conversation_fk_idx
  on sms_messages (conversation_id);

create index if not exists sms_messages_customer_fk_idx
  on sms_messages (customer_id);
