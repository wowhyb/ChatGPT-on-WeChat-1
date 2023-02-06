import { Config } from "./config.js";
import { Message, } from "wechaty";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Configuration, OpenAIApi } from "openai";
import { FileBox } from 'file-box'
// ChatGPT error response configuration
const chatgptErrorMessage = "🤖️：AI机器人摆烂了，请稍后再试～";

// ChatGPT model configuration
// please refer to the OpenAI API doc: https://beta.openai.com/docs/api-reference/introduction
const ChatGPTModelConfig = {
  // this model field is required
  model: 'text-davinci-003',
  temperature: 0.9,
  // max_tokens: 4096,
  top_p: 1,
  frequency_penalty: 0.0,
  presence_penalty: 0.6
};

// message size for a single reply by the bot
const SINGLE_MESSAGE_MAX_SIZE = 500;

enum MessageType {
  Unknown = 0,
  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}

export class ChatGPTBot {
  botName: string = "";
  chatgptTriggerKeyword = Config.chatgptTriggerKeyword;
  chatgptTriggerImgKeyword = Config.chatgptTriggerImgKeyword;
  OpenAIConfig: any; // OpenAI API key
  OpenAI: any; // OpenAI API instance

  // Chatgpt fine-tune for being a chatbot (guided by OpenAI official document)
  applyContext(text: string): string {
    return `You are an artificial intelligence bot from a company called "OpenAI". Your primary tasks are chatting with users and answering their questions.\nIf the user says: ${text}.\nYou will say: `;
  }

  setBotName(botName: string) {
    this.botName = botName;
  }

  // get trigger keyword in group chat: (@Name <keyword>)
  get chatGroupTriggerKeyword(): string {
    return `@${this.botName} ${this.chatgptTriggerKeyword || ""}`;
  }

  get chatGroupTriggerImgKeyword(): string {
    return `@${this.botName} ${this.chatgptTriggerImgKeyword || ""}`;
  }

  // configure API with model API keys and run an initial test
  async startGPTBot() {
    try {
      // OpenAI Account configuration
      this.OpenAIConfig = new Configuration({
        organization: Config.openaiOrganizationID,
        apiKey: Config.openaiApiKey,
      });
      // OpenAI API instance
      this.OpenAI = new OpenAIApi(this.OpenAIConfig);
      // Hint user the trigger keyword in private chat and group chat
      console.log(`🤖️ Chatbot name is: ${this.botName}`);
      console.log(`🎯 Trigger keyword in private chat is: ${this.chatgptTriggerKeyword}`);
      console.log(`🎯 Trigger keyword in group chat is: ${this.chatGroupTriggerKeyword}`);
      // Run an initial test to confirm API works fine
      await this.onChatGPT("Say Hello World");
      console.log(`✅ Chatbot starts success, ready to handle message!`);
    } catch (e) {
      console.error(`❌ ${e}`);
    }
  }

  // get clean message by removing reply separater and group mention characters
  cleanMessage(rawText: string, isPrivateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    text = text.replace(
      isPrivateChat ? this.chatgptTriggerKeyword : this.chatGroupTriggerKeyword,
      ""
    );
    return text;
  }

  cleanMessageByImg(rawText: string, isPrivateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    text = text.replace(
      isPrivateChat ? this.chatgptTriggerImgKeyword : this.chatGroupTriggerImgKeyword,
      ""
    );
    return text;
  }

  pdMeessageByImg(rawText: string, isPrivateChat: boolean = false): number {
    const chatgptTriggerKeyword = this.chatgptTriggerKeyword;
    const chatgptTriggerImgKeyword = this.chatgptTriggerImgKeyword;
    let triggered: number = 0
    if (isPrivateChat && rawText) {
      triggered = rawText.startsWith(chatgptTriggerKeyword)
        ? 1
        : rawText.startsWith(chatgptTriggerImgKeyword) ? 2 : 0;
    } else {
      triggered = rawText.startsWith(this.chatGroupTriggerKeyword) ? 1 : rawText.startsWith(this.chatGroupTriggerImgKeyword) ? 2 : 0;
    }
    return triggered
  }


  // check whether ChatGPT bot can be triggered
  triggerGPTMessage(text: string, isPrivateChat: boolean = false): boolean {
    const chatgptTriggerKeyword = this.chatgptTriggerKeyword;
    let triggered = false;
    if (isPrivateChat) {
      triggered = chatgptTriggerKeyword
        ? text.startsWith(chatgptTriggerKeyword)
        : true;
    } else {
      triggered = text.startsWith(this.chatGroupTriggerKeyword);
    }
    if (triggered) {
      console.log(`🎯 Chatbot triggered: ${text}`);
    }
    return triggered;
  }

  // check whether ChatGPT bot can be triggered
  triggerGPTMessageByImg(text: string, isPrivateChat: boolean = false): boolean {
    const chatgptTriggerImgKeyword = this.chatgptTriggerImgKeyword;
    let triggered = false;
    if (isPrivateChat) {
      triggered = chatgptTriggerImgKeyword
        ? text.startsWith(chatgptTriggerImgKeyword)
        : true;
    } else {
      triggered = text.startsWith(this.chatGroupTriggerImgKeyword);
    }
    if (triggered) {
      console.log(`🎯 Chatbot triggered: ${text}`);
    }
    return triggered;
  }

  // filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      // self-chatting can be used for testing
      talker.self() ||
      messageType > MessageType.GroupNote ||
      talker.name() == "微信团队" ||
      // video or voice reminder
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // red pocket reminder
      text.includes("收到红包，请在手机上查看") ||
      // location information
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
  }

  // send question to ChatGPT with OpenAI API and get answer
  async onChatGPT(text: string): Promise<string> {
    const inputMessage = this.applyContext(text);
    try {
      // config OpenAI API request body
      const response = await this.OpenAI.createCompletion({
        ...ChatGPTModelConfig,
        prompt: inputMessage,
      });
      // use OpenAI API to get ChatGPT reply message
      const chatgptReplyMessage = response?.data?.choices[0]?.text?.trim();
      console.log("🤖️ Chatbot says: ", chatgptReplyMessage);
      return chatgptReplyMessage;
    } catch (e: any) {
      const errorResponse = e?.response;
      const errorCode = errorResponse?.status;
      const errorStatus = errorResponse?.statusText;
      const errorMessage = errorResponse?.data?.error?.message;
      console.error(`❌ Code ${errorCode}: ${errorStatus}`);
      console.error(`❌ ${errorMessage}`);
      return chatgptErrorMessage;
    }
  }

  // send question to ChatGPT with OpenAI API and get answer
  async onChatGPTByImg(text: string): Promise<string> {
    const inputMessage = this.applyContext(text);
    try {
      // config OpenAI API request body
      const response = await this.OpenAI.createImage({
        n: 1,
        size: "1024x1024",
        prompt: inputMessage,
      });
      // use OpenAI API to get ChatGPT reply message
      const chatgptReplyMessage = response.data.data[0].url;
      console.log(response.data)
      console.log("🤖️ Chatbot says: ", chatgptReplyMessage);
      return chatgptReplyMessage;
    } catch (e: any) {
      const errorResponse = e?.response;
      const errorCode = errorResponse?.status;
      const errorStatus = errorResponse?.statusText;
      const errorMessage = errorResponse?.data?.error?.message;
      console.error(`❌ Code ${errorCode}: ${errorStatus}`);
      console.error(`❌ ${errorMessage}`);
      return chatgptErrorMessage;
    }
  }

  // reply with the segmented messages from a single-long message
  async reply(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }

  async replyByImg(
    talker: RoomInterface | ContactInterface,
    mesasge: string,
    msg: any = false
  ): Promise<void> {
    if (msg) {
      const result = `${msg}\n ---------- \n ${mesasge}`;
      await talker.say(result);
      const img = FileBox.fromUrl(mesasge)
      console.log(img)
      try {
        await talker.say(img);
      } catch (e: any) {
        console.error(`${e}`);
      }
    } else {
      await talker.say(mesasge);
      const img = FileBox.fromUrl(mesasge)
      console.log(img)
      try {
        await talker.say(img);
      } catch (e: any) {
        console.error(`${e}`);
      }
    }
  }

  // reply to private message
  async onPrivateMessage(talker: ContactInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPT(text);
    // send the ChatGPT reply to chat
    await this.reply(talker, chatgptReplyMessage);
  }

  // reply to group message
  async onGroupMessage(room: RoomInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPT(text);
    // the reply consist of: original text and bot reply
    const result = `${text}\n ---------- \n ${chatgptReplyMessage}`;
    await this.reply(room, result);
  }


  // reply to private message
  async onPrivateMessageByImg(talker: ContactInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPTByImg(text);
    // send the ChatGPT reply to chat
    await this.replyByImg(talker, chatgptReplyMessage);
  }

  // reply to group message
  async onGroupMessageByImg(room: RoomInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPTByImg(text);
    // the reply consist of: original text and bot reply
    const result = `${text}\n ---------- \n ${chatgptReplyMessage}`;
    await this.replyByImg(room, chatgptReplyMessage, text);
  }


  // receive a message (main entry)
  async onMessage(message: Message) {
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const isPrivateChat = !room;
    let isimgmsg = false;
    console.log(talker)
    console.log(room)
    console.log(rawText)
    // do nothing if the message:
    //    1. is irrelevant (e.g. voice, video, location...), or
    //    2. doesn't trigger bot (e.g. wrong trigger-word)
    if (
      this.isNonsense(talker, messageType, rawText) ||
      (!this.triggerGPTMessage(rawText, isPrivateChat) && !this.triggerGPTMessageByImg(rawText, isPrivateChat))
    ) {
      return;
    }
    console.log('startchat')
    // clean the message for ChatGPT input
    let text = this.cleanMessage(rawText, isPrivateChat);
    console.log(text)
    let s = this.pdMeessageByImg(rawText, isPrivateChat);
    console.log(s)
    // reply to private or group chat
    if (s === 1) {
      if (isPrivateChat) {
        return await this.onPrivateMessage(talker, text);
      } else {
        return await this.onGroupMessage(room, text);
      }
    } else if (s === 2) {
      if (isPrivateChat) {
        return await this.onPrivateMessageByImg(talker, text);
      } else {
        return await this.onGroupMessageByImg(room, text);
      }
    }

  }
}
