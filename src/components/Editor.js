import React, { useEffect, useRef } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/go/go';
import ACTIONS from '../Actions';

const Editor = ({ socketRef, roomId, onCodeChange, language }) => {
    const editorRef = useRef(null);
    useEffect(() => {
        async function init() {
            editorRef.current = Codemirror.fromTextArea(
                document.getElementById('realtimeEditor'),
                {
                    mode: getLanguageMode(language),
                    theme: 'dracula',
                    autoCloseTags: true,
                    autoCloseBrackets: true,
                    lineNumbers: true,
                }
            );

            editorRef.current.on('change', (instance, changes) => {
                const { origin } = changes;
                const code = instance.getValue();
                onCodeChange(code);
                if (origin !== 'setValue') {
                    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code,
                    });
                }
            });
        }
        init();
    }, []);

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null) {
                    editorRef.current.setValue(code);
                }
            });
        }

        return () => {
            socketRef.current.off(ACTIONS.CODE_CHANGE);
        };
    }, [socketRef.current]);

    useEffect(() => {
        if (editorRef.current) {
            const mode = getLanguageMode(language);
            editorRef.current.setOption('mode', mode);
        }
    }, [language]);

    function getLanguageMode(lang) {
        switch(lang) {
            case 'python':
                return { name: 'python' };
            case 'java':
                return { name: 'text/x-java' };
            case 'cpp':
                return { name: 'text/x-c++src' };
            case 'c':
                return { name: 'text/x-csrc' };
            case 'go':
                return { name: 'text/x-go' };
            case 'ruby':
                return { name: 'text/x-ruby' };
            default:
                return { name: 'javascript', json: true };
        }
    }

    return <textarea id="realtimeEditor"></textarea>;
};

export default Editor;
