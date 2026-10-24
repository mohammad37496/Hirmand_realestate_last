import assert from "node:assert/strict";
import test from "node:test";
import { parseMusicFilename } from "./music-filename.ts";

test("parses numbered Yo-Yo Ma file without leaving the track number or extension", () => {
  assert.deepEqual(
    parseMusicFilename("001 - Yo_Yo_Ma_Cello_Suite_No_1_in_G_Major, BWV 1007 I Prélude.mp3"),
    { artist: "Yo Yo Ma", title: "Cello Suite No 1 in G Major, BWV 1007 I Prélude" },
  );
});

test("parses numbered Carl Davis file and preserves title punctuation", () => {
  assert.deepEqual(
    parseMusicFilename("009 - Carl_Davis_Zadok_the_Priest_Coronation_Anthem_No_1, HWV 258.mp3"),
    { artist: "Carl Davis", title: "Zadok the Priest Coronation Anthem No 1, HWV 258" },
  );
});

test("parses Anja Lechner and keeps composer metadata inside the title", () => {
  assert.deepEqual(
    parseMusicFilename("211 - Anja_Lechner_Cello_Suite_No_2_in_D_Minor, BWV 1008 J_S_Bach__Cello.mp3"),
    { artist: "Anja Lechner", title: "Cello Suite No 2 in D Minor, BWV 1008 J S Bach Cello" },
  );
});

test("does not guess-split unknown artists, collaborations, or complex titles", () => {
  assert.deepEqual(parseMusicFilename("004 - Max Richter & Yuki Numata On the Nature of Daylight.m4a"), {
    artist: "",
    title: "Max Richter & Yuki Numata On the Nature of Daylight",
  });
  assert.deepEqual(parseMusicFilename("001 - Yo_Yo_Ma_&_Max_Richter_The_Blue_Notebooks.mp3"), {
    artist: "",
    title: "Yo Yo Ma & Max Richter The Blue Notebooks",
  });
});

test("supports explicit J. S. Bach prefix without damaging the rest of the title", () => {
  assert.deepEqual(parseMusicFilename("J_S_Bach_Air_on_the_G_String.wav"), {
    artist: "J S Bach",
    title: "Air on the G String",
  });
});
