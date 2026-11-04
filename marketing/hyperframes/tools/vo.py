import asyncio, json, os, sys, edge_tts
# python3 vo.py VOICE "matn" out.mp3 [rate]  -> out.mp3 + out.words.json
voice, text, out = sys.argv[1], sys.argv[2], sys.argv[3]; rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"
async def main():
    c = edge_tts.Communicate(text, voice, rate=rate, proxy=os.environ["HTTPS_PROXY"], boundary="WordBoundary")
    words = []
    with open(out, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"w": ch["text"], "s": round(ch["offset"]/1e7, 3), "e": round((ch["offset"]+ch["duration"])/1e7, 3)})
    json.dump(words, open(out.rsplit(".",1)[0] + ".words.json", "w"), ensure_ascii=False)
    print(out, len(words), "so'z, oxiri", words[-1]["e"] if words else None)
asyncio.run(main())
