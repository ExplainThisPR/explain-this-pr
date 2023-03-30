import { logger, config } from 'firebase-functions';
import { Configuration, CreateChatCompletionRequest, OpenAIApi } from 'openai';
import { ReducedUpdatedFile } from './types';

const apiKey = config().openai.api_key;
const configuration = new Configuration({
  apiKey,
});
const OpenAI = new OpenAIApi(configuration);

export default class ChatGPT {
  protected static options: CreateChatCompletionRequest = {
    model: 'gpt-3.5-turbo',
    max_tokens: 400,
    temperature: 0.3,
    frequency_penalty: 0.2,
    presence_penalty: 0.3,
    top_p: 1,
    messages: [],
  };

  /**
   * Make a request to ChatGPT to get an explanation
   * @param chunks The chunks of text to send to GPT
   * @returns The AI explaination
   */
  static async explainThisPR(chunks: ReducedUpdatedFile[][]) {
    let responses = await Promise.all(
      chunks.map(async (chunk) => {
        const combined = JSON.stringify(chunk);
        if (combined.length < 30) {
          // This chunk is too small to send to GPT
          return '';
        }

        const explained = await this.sendToGPT(combined);
        return explained;
      }),
    );
    responses = responses.filter(Boolean);

    const prefix = [
      '## :robot: Explain this PR :robot:',
      'Here is a summary of what I noticed. I am a Bot in Beta, so I might be wrong. :smiling_face_with_tear:',
      'Please [share your feedback](https://tally.so/r/3jZG9E) with me. :heart:',
      '---',
    ];
    if (responses.length === 0) {
      logger.error('No responses from GPT');
      responses = [
        'No changes to analyze. Something likely went wrong. :thinking_face: We will look into it!',
        'Sometimes re-running the analysis helps with timeout issues. :shrug:',
      ];
    }

    const comment = [...prefix, ...responses].join('\n');
    return comment;
  }

  /**
   * Ask GPT to explain the content of the PR
   * @param content The content to send to GPT
   * @returns
   */
  protected static async sendToGPT(content: string) {
    try {
      const prompt = `
      You are an assistant designed to help developer teams review the PRs. Every time a PR is opened, I will send you a code file with the before and the after.
      I want you to compare the two and give me an overview of the things that were changed in the code in a bullet list format.
      I want your comments to be focused on architectural changes that affect the app.
      The format of your response should be in Markdown. Here is an example of a response.
      Limit how many import statements you have per file to 3 max.
      Please do not repeat yourself. If you already mention a technology like \`useFonts\` do not mention it again for that file.
      Please use the full filename. For example, \`src/components/Button.tsx\` is better than \`Button.tsx\`.
      Please be concise and do not talk repeatedly about the same change. If you have already mentioned how PDF data generation works for example, do not discuss again it.
      Only focus on the most impactful functional changes. The maximum is 4 bullet points. For each additional bullet point, divide the total \`patch\` length by 1500 to determine how many more bullet points you can add for this file.
      Here is an example of a response:
      ## src/App.tsx
        - Moved the routing logic to a standalone \`Router\` component
        - Setup a listener for the AuthState of the user and update the Redux store with the current user
  
      `;
      logger.info('Making a GPT Request...');
      const { data } = await OpenAI.createChatCompletion({
        ...this.options,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content },
        ],
      });
      logger.info('Handling GPT Response ', {
        usage: data.usage,
      });
      const message = data?.choices[0].message?.content;
      return message || '';
    } catch (err: any) {
      const error = err?.response?.data || err;
      logger.error('Failed to make GPT request', error);
      return null;
    }
  }
}
