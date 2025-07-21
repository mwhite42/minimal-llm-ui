"use client";

import { useModal } from "@/app/context/ModalContext";
import { useSystemInstruction } from "@/app/context/SystemInstructionContext";
import { cn } from "@/utils/cn";
import { motion } from "framer-motion";
import { useState } from "react";
import ExpandingTextInput from "../expanding-text-input";

export default function AddSystemInstructionModal() {
  const { addNewSystemInstruction } = useSystemInstruction();
  const { setModalConfig } = useModal();
  const [content, setContent] = useState<string>("");
  const [instructionName, setInstructionName] = useState<string>("");

  function closeModal() {
    setModalConfig({ modal: undefined, data: undefined });
  }

  function handleContentChange(e: any) {
    setContent(e.target.value);
  }

  const saveInstructionName = (e: any) => {
    const value = e.target.value;
    setInstructionName(value);
  };

  function saveInstruction() {
    if (instructionName && content) {
      addNewSystemInstruction(instructionName, content);
      closeModal();
    }
  }

  const bgVariant = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  return (
    <div className="relative z-[9999]">
      <motion.div
        variants={bgVariant}
        initial={"hidden"}
        animate={"visible"}
        exit={"hidden"}
        className="fixed inset-0 bg-[#000000]/20 backdrop-blur-md transition-opacity"
      />

      <div className="fixed inset-0 z-10 overflow-y-auto">
        <div
          onClick={() => closeModal()}
          className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/black relative flex max-h-[80vh] transform flex-col overflow-hidden rounded-sm border border-white/20 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl"
          >
            <div className="rounded-sm bg-black">
              <motion.div
                layout
                className="flex flex-col gap-y-2 rounded-sm bg-black p-2 text-sm text-white"
              >
                <div>{"Add System Instruction"}</div>
                <hr className="border-white/10" />
                
                <div className="mb-2">
                  <label className="block text-white/50 mb-1">Instruction Name</label>
                  <ExpandingTextInput
                    onChange={(e: any) => {saveInstructionName(e)}}
                    value={instructionName}
                    placeholder={"Enter Instruction Name..."}
                    expand={false}
                  />
                </div>
                
                <div className="mb-2">
                  <label className="block text-white/50 mb-1">Instruction Content</label>
                  <ExpandingTextInput
                    onChange={(e: any) => {handleContentChange(e)}}
                    value={content}
                    placeholder={"Enter system instruction content..."}
                    expand={true}
                  />
                </div>
                
                <hr className="border-white/10" />
                <button
                  disabled={!content || content.length === 0 || instructionName.length === 0}
                  onClick={saveInstruction}
                  className={cn("rounded-sm px-2 py-1 text-black", {
                    "bg-white": content && content.length > 0 && instructionName.length > 0,
                    "bg-white/50": content.length === 0 || instructionName.length === 0,
                  })}
                >
                  {"Save"}
                </button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}