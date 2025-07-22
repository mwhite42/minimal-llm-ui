"use client";
import AppNavbar from "@/components/app-navbar";
import CommandMenu from "@/components/command-menu";
import CommandTextInput from "@/components/command-text-input";
import ExpandingTextInput from "@/components/expanding-text-input";
import { CopyIcon } from "@/components/icons/copy-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { SaveIcon } from "@/components/icons/save-icon";
import { TrashIcon } from "@/components/icons/trash-icon";
import Sidebar from "@/components/sidebar";
import { cn } from "@/utils/cn";
import { baseUrl, fallbackModel } from "@/utils/constants";
import generateRandomString from "@/utils/generateRandomString";
import { useCycle } from "framer-motion";
import { ChatOllama } from "langchain/chat_models/ollama";
import { AIMessage, HumanMessage } from "langchain/schema";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppModal, useModal } from "./context/ModalContext";
import { usePrompts } from "./context/PromptContext";

export default function Home() {
  const { setModalConfig } = useModal();
  const { activePromptTemplate, setActivePromptTemplate } = usePrompts();
  const [newPrompt, setNewPrompt] = useState("");
  const [messages, setMessages] = useState<
    {
      type: string;
      id: any;
      timestamp: number;
      content: string;
      model?: string;
    }[]
  >([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [activeModel, setActiveModel] = useState<string>("");
  const [ollama, setOllama] = useState<ChatOllama>();
  const [conversations, setConversations] = useState<
    { title: string; filePath: string }[]
  >([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [menuState, toggleMenuState] = useCycle(false, true);
  const msgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation]);

  useEffect(() => {
    // Get the initial model
    getInitialModel();

    // Get existing conversations
    getExistingConvos();
  }, []);

  function getInitialModel() {
    fetch(`${baseUrl}/api/tags`)
      .then((response) => response.json())
      .then((data) => {
        // console.log(data);
        setAvailableModels(data.models);

        // get initial model from local storage
        const storedModel = localStorage.getItem("initialLocalLM");
        if (
          storedModel &&
          storedModel !== "" &&
          data.models.findIndex(
            (m: { name: string }) =>
              m.name.toLowerCase() === storedModel.toLowerCase(),
          ) > -1
        ) {
          setActiveModel(storedModel);
          const newOllama = new ChatOllama({
            baseUrl: baseUrl,
            model: storedModel,
          });
          setOllama(newOllama);
        } else {
          // set initial model to first model in list
          setActiveModel(data.models[0]?.name);
          const initOllama = new ChatOllama({
            baseUrl: baseUrl,
            model: data.models[0]?.name,
          });
          setOllama(initOllama);
        }
      });
  }

  async function getExistingConvos() {
    fetch("../api/fs/get-convos", {
      method: "POST", // or 'GET', 'PUT', etc.
      body: JSON.stringify({
        conversationPath: "./conversations",
      }),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
      },
    }).then((response) => {
      // console.log(response),
      response.json().then((data) => setConversations(data));
    });
  }

  async function triggerPrompt(input: string = newPrompt) {
    if (!ollama) return;
    scrollToBottom();
    if (messages.length == 0) getName(input);
    const msg = {
      type: "human",
      id: generateRandomString(8),
      timestamp: Date.now(),
      content: input,
    };
    const model = activeModel;
    let streamedText = "";
    messages.push(msg);
    const msgCache = [...messages];
    const stream = await ollama.stream(
      messages.map((m) =>
        m.type == "human"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
    );
    setNewPrompt("");
    setActivePromptTemplate(undefined);
    let updatedMessages = [...msgCache];
    let c = 0;
    for await (const chunk of stream) {
      streamedText += chunk.content;
      const aiMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: streamedText,
        model,
      };
      updatedMessages = [...msgCache, aiMsg];
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  async function persistConvo(messages: any[]) {
    let name = activeConversation;
    if (name == "") {
      name = (await getName(newPrompt)).trim();
      // console.log(name.trim());
      setActiveConversation(name.trim());
    }

    fetch("../api/fs/persist-convo", {
      method: "POST", // or 'GET', 'PUT', etc.
      body: JSON.stringify({
        conversationPath: "./conversations",
        messages: messages,
        convoTitle: name.trim().replaceAll('"', ""),
        filename:
          name
            .toLowerCase()
            .replaceAll(" ", "_")
            .replaceAll(":", "-")
            .replaceAll('"', "") + ".json",
      }),
    }).then(() => getExistingConvos());
  }

  function deleteMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    let filtered = messages.filter((m, i) => m.id != activeMsg.id);
    setMessages(() => filtered);
    persistConvo(filtered);
  }

  async function refreshMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    if (!ollama) return;
    let index =
      messages.findIndex((m) => m.id == activeMsg.id) -
      (activeMsg.type == "human" ? 0 : 1);
    let filtered = messages.filter((m, i) => index >= i);
    // console.log("filtered", filtered);

    setMessages(() => filtered);
    // useEffect on change here if the last value was a human message?

    const model = activeModel;
    let streamedText = "";
    const msgCache = [...filtered];
    const stream = await ollama.stream(
      filtered.map((m) =>
        m.type == "human"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
    );
    setNewPrompt("");
    let updatedMessages = [...msgCache];
    let c = 0;
    for await (const chunk of stream) {
      streamedText += chunk.content;
      const aiMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: streamedText,
        model,
      };
      updatedMessages = [...msgCache, aiMsg];
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  const scrollToBottom = () => {
    if (msgContainerRef.current) {
      msgContainerRef.current.scrollTo({
        top: msgContainerRef.current.scrollHeight + 10000,
        behavior: "smooth",
      });
    }
  };

  function getName(input: string) {
    const nameOllama = new ChatOllama({
      baseUrl: baseUrl,
      model: activeModel && activeModel.trim() !== "" ? activeModel : fallbackModel,
      verbose: false,
    });
    return nameOllama!
      .predict(
        "You're a tool, that receives an input and responds exclusively with a 2-5 word summary of the topic (and absolutely no prose) based specifically on the words used in the input (not the expected output). Each word in the summary should be carefully chosen so that it's perfecly informative - and serve as a perfect title for the input. Now, return the summary for the following input:\n" +
          input,
      )
      .then((name) => name);
  }

return (
  <main className="relative flex h-screen w-screen items-stretch overflow-hidden bg-[#f7f7f7]">
    <Sidebar
      activeConversation={activeConversation}
      conversations={conversations}
      menuState={menuState}
      setActiveConversation={setActiveConversation}
      setConversations={setConversations}
      setMessages={setMessages}
      setNewPrompt={setNewPrompt}
      toggleMenuState={toggleMenuState}
    />
    <div
      className={cn(
        "flex flex-1 flex-col transition-all duration-300 ease-in-out",
        menuState ? "ml-80" : "ml-0"
      )}
    >
      <AppNavbar
        documentName={activeConversation}
        setDocumentName={() => {}}
        activeModel={activeModel}
        availableModels={availableModels}
        setActiveModel={setActiveModel}
        setOllama={setOllama}
      />
      <div className="flex-1 overflow-hidden bg-white">
        <div className="flex h-full flex-col">
          <div
            ref={msgContainerRef}
            className="flex-1 overflow-y-auto px-4 py-6 md:px-8"
          >
            <div className="mx-auto max-w-4xl">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <h2 className="mb-2 text-2xl font-semibold text-gray-700">Welcome to your personal AI Assistant</h2>
                    <p className="text-gray-500">Start a conversation to begin</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={"message-" + msg.id}
                      className={cn(
                        "group relative flex gap-3",
                        msg.type === "human" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-4 py-3",
                          msg.type === "human"
                            ? "bg-[#01a982] text-white"
                            : "bg-gray-100 text-gray-800"
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs opacity-70">
                            {msg?.model?.split(":")[0] || "You"} •{" "}
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <Markdown
                          remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                          className="prose prose-sm max-w-none"
                        >
                          {msg.content.trim()}
                        </Markdown>
                        <div className="mt-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          {msg.type === "human" && (
                            <SaveIcon
                              onClick={() => {
                                setModalConfig({
                                  modal: AppModal.SAVE_PROMPT,
                                  data: msg,
                                });
                              }}
                              className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                            />
                          )}
                          <RefreshIcon
                            onClick={() => refreshMessage(msg)}
                            className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                          />
                          <CopyIcon
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                            }}
                            className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                          />
                          <TrashIcon
                            onClick={() => {
                              deleteMessage(msg);
                            }}
                            className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t bg-white px-4 py-4 md:px-8">
            <div className="mx-auto max-w-4xl">
              <CommandMenu
                showMenu={
                  !activePromptTemplate &&
                  !!newPrompt &&
                  newPrompt.startsWith("/") &&
                  newPrompt == "/" + newPrompt.replace(/[^a-zA-Z0-9_]/g, "")
                }
                filterString={newPrompt.substring(1)}
              />
              <div className="relative">
                {activePromptTemplate ? (
                  <CommandTextInput
                    onKeyDown={(x) => {
                      if (
                        x.e.key === "Enter" &&
                        !x.e.metaKey &&
                        !x.e.shiftKey &&
                        !x.e.altKey &&
                        newPrompt !== ""
                      ) {
                        triggerPrompt(x.input);
                      }
                    }}
                  />
                ) : (
                  <ExpandingTextInput
                    onChange={(e: any) => {
                      if (e.target.value != "\n") setNewPrompt(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.metaKey &&
                        !e.shiftKey &&
                        !e.altKey &&
                        newPrompt !== ""
                      ) {
                        triggerPrompt();
                      }
                    }}
                    value={newPrompt}
                    placeholder="Send a message"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 placeholder-gray-500 focus:border-[#01a982] focus:outline-none focus:ring-2 focus:ring-[#01a982] focus:ring-opacity-50"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
);
}
