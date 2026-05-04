-- Create chat_history table to store AI chat messages
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id_created 
ON chat_history(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own chat history
CREATE POLICY "Users can view their own chat history" ON chat_history
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own chat messages
CREATE POLICY "Users can insert their own chat history" ON chat_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own chat history
CREATE POLICY "Users can update their own chat history" ON chat_history
  FOR UPDATE USING (auth.uid() = user_id);
