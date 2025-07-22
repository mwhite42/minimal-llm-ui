"use client";

import { ChatOllama } from "langchain/chat_models/ollama";
import { baseUrl } from "@/utils/constants";
import { useEffect, useRef, useState } from "react";

type Props = {
  documentName: string;
  setDocumentName: Function;
  activeModel: string;
  availableModels: any[];
  setActiveModel: Function;
  setOllama: Function;
};

export default function AppNavbar({
  documentName,
  setDocumentName,
  activeModel,
  availableModels,
  setActiveModel,
  setOllama,
}: Props) {
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDocumentName(value); // Call the callback function to update the parent component
  };

  useEffect(() => {
    const handleDocumentClick = (event: any) => {
      if (
        isShareMenuOpen &&
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target)
      ) {
        setIsShareMenuOpen(false);
      }

      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [isShareMenuOpen, isProfileMenuOpen]);

  function toggleModel() {
    const i =
      (availableModels.findIndex((x) => x.name == activeModel) + 1) %
      availableModels.length;
    console.log(i, activeModel, availableModels);
    setActiveModel(availableModels[i].name);
    const newOllama = new ChatOllama({
      baseUrl: baseUrl,
      model: availableModels[i]?.name,
    });
    //store in local storage
    localStorage.setItem("initialLocalLM", availableModels[i]?.name);
    setOllama(newOllama);
  }

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

return (
    <nav className="sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4 ml-4">
          <input
            className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 outline-none placeholder-gray-400 transition-colors hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-[#01a982] focus:ring-opacity-50"
            placeholder="Untitled Conversation"
            value={documentName}
            onChange={handleInputChange}
          />
        </div>
        <button
          className="rounded-lg border border-[#01a982] bg-white px-4 py-1.5 text-sm font-medium text-[#01a982] transition-all hover:bg-[#01a982] hover:text-white"
          onClick={toggleModel}
        >
          {activeModel || "Select Model"}
        </button>
      </div>
    </nav>
  );
}
