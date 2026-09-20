"""
Regression tests built from the problems seen in a real trip chat (Calgary, Sep 2026):
  - a question nobody answered until a human tagged Huddle
  - the same "decision still open" nudge posted over and over
  - pushback on Huddle's style ("we want concrete plans")
  - "I don't wanna spend too much" must not read as a complaint about Huddle

Run from ml/:  python -m unittest discover -s tests
"""
import unittest

from huddle_ml import labeling, taste
from huddle_ml.models import Dataset, MIN_PER_CLASS, train
from huddle_ml.session import Message, Session, from_text, _scrub

import numpy as np


def chat(*rows):
    """rows: (seconds, sender, text[, trigger[, queued_s]])"""
    msgs = []
    for i, r in enumerate(rows):
        t, sender, text = r[:3]
        msgs.append(Message(f"m{i}", float(t), sender, text, trigger=r[3] if len(r) > 3 else None,
                            queued_t=float(r[4]) if len(r) > 4 else None))
    return Session("test", msgs)


class Labeling(unittest.TestCase):
    def test_unanswered_question_before_a_tag_is_a_missed_moment(self):
        s = chat(
            (0, "agent", "got it, i'll read along"),
            (10, "P1", "Do you know what's good in Calgary in december?"),
            (20, "P2", "lol no idea"),
            (300, "P1", "@huddle can u reply"),
            (312, "agent", "the zoo runs a light display through jan 4"),
        )
        moments, report = labeling.label_moments(s)
        by_id = {m.msg_id: m for m in moments}
        self.assertEqual(by_id["m1"].label, "speak")
        self.assertTrue(by_id["m3"].direct)
        self.assertEqual(report.missed, ["m1"])
        self.assertEqual(report.summons[0]["waited_s"], 12)

    def test_repeated_nudge_is_flagged_and_its_moment_is_silent(self):
        nudge = "fairmont at lake louise has rooms from $520 a night, you both want the johnston canyon full day tour"
        s = chat(
            (0, "agent", "hi"),
            (10, "P1", "I want the lake louise johnston canyon tour"),
            (60, "agent", nudge, "conflict", 30),
            (400, "P2", "ok cool"),
            (900, "agent", nudge.replace("has rooms from", "has rooms starting at"), "conflict", 450),
        )
        posts = {p.msg_id: p for p in labeling.label_posts(s)}
        self.assertEqual(posts["m4"].label, "repeat")
        moments, report = labeling.label_moments(s)
        self.assertIn("m4", report.repeats)
        self.assertEqual({m.msg_id: m for m in moments}["m3"].label, "silent")

    def test_pushback_marks_the_post_corrected(self):
        s = chat(
            (0, "agent", "hi"),
            (10, "P1", "@huddle give me a plan"),
            (20, "agent", "roughly dec 26 to jan 5, options include the zoo or tubing"),
            (40, "P1", "ok u are giving us ranges, we want concrete plans"),
        )
        posts = {p.msg_id: p for p in labeling.label_posts(s)}
        self.assertEqual(posts["m2"].label, "corrected")

    def test_restating_an_open_decision_in_prose_is_a_nag_but_the_numbered_list_is_not(self):
        s = chat(
            (0, "agent", "hi"),
            (10, "P1", "I want the lake louise tour"),
            (60, "agent", "banff day trip is still open, need to pick one or replan", "conflict", 30),
            (700, "P2", "ok"),
            (900, "agent", "still open, most important first:\n1. Skiing - is it happening?\n2. Tour - which date?", "digest", 800),
            (1200, "agent", "the tour is $162pp and the zoo is free, want it?", "chime_in", 1100),
        )
        posts = {p.msg_id: p.label for p in labeling.label_posts(s)}
        self.assertEqual(posts["m2"], "nag")
        self.assertNotEqual(posts["m4"], "nag")
        self.assertNotEqual(posts["m5"], "nag")
        _, report = labeling.label_moments(s)
        self.assertEqual(report.nags, ["m2"])

    def test_direct_answer_about_status_is_not_a_nag(self):
        s = chat((0, "agent", "hi"), (10, "P1", "@huddle where are we"), (20, "agent", "banff day trip is still open, waiting on dates"))
        self.assertNotEqual({p.msg_id: p.label for p in labeling.label_posts(s)}["m2"], "nag")

    def test_talking_about_money_is_not_pushback(self):
        s = chat(
            (0, "agent", "hi"),
            (10, "agent", "johnston canyon icewalk is $104pp, the full day tour is $162pp"),
            (30, "P1", "what about the money tho i dont wanna spend too much"),
        )
        posts = {p.msg_id: p for p in labeling.label_posts(s)}
        self.assertNotEqual(posts["m1"].label, "corrected")

    def test_reply_that_agrees_marks_the_post_good(self):
        s = chat(
            (0, "agent", "hi"),
            (10, "P1", "what else is there to do"),
            (20, "agent", "dec 26 to jan 15 is 21 days, want me to build a full schedule?", "chime_in", 15),
            (50, "P2", "yes exactly, a full schedule"),
        )
        posts = {p.msg_id: p for p in labeling.label_posts(s)}
        self.assertEqual(posts["m2"].label, "good")
        moments, _ = labeling.label_moments(s)
        self.assertEqual({m.msg_id: m for m in moments}["m1"].label, "speak")

    def test_hand_labels_win(self):
        s = chat((0, "agent", "hi"), (10, "P1", "we should book the fairmont"), (30, "P2", "yes"))
        labeling.LABELS_DIR.mkdir(exist_ok=True)
        path = labeling.LABELS_DIR / "test.json"
        path.write_text('{"moments": {"m1": {"label": "speak", "weight": 1.0}}}')
        try:
            moments, _ = labeling.label_moments(s)
            self.assertEqual({m.msg_id: m for m in moments}["m1"].label, "speak")
        finally:
            path.unlink()


class Ingest(unittest.TestCase):
    def test_text_transcript_is_anonymized(self):
        s = from_text("Alice: hi call me on 613-410-7916\nBob: hey alice\nHuddle: hello", "t")
        self.assertEqual([m.sender for m in s.messages], ["P1", "P2", "agent"])
        self.assertNotIn("7916", s.messages[0].text)
        self.assertNotIn("alice", s.messages[1].text.lower())

    def test_scrub_removes_phone_numbers(self):
        self.assertEqual(_scrub("text +16134107916 now", {}), "text <phone> now")


class Taste(unittest.TestCase):
    def test_recent_spend_mood_wins_and_spend_talk_is_read_both_ways(self):
        s = chat(
            (0, "P1", "i dont wanna spend too much"),
            (10, "P1", "flights will be expensive"),
            (20, "P2", "meh"),
            (30, "P1", "make the most expensive trip you can"),
            (40, "P1", "we wanna stay at the fairmont, splurge"),
            (50, "P1", "helicopter tour, upgrade everything"),
        )
        prof = taste.build([s])
        self.assertGreater(prof["people"]["test:P1"]["spend"], 0)

    def test_rejected_topics_score_negative(self):
        s = chat((0, "P1", "i am not doing the zoo for days"), (5, "P1", "no zoo again"))
        prof = taste.build([s])
        self.assertLess(prof["group"]["topics"]["family_lights"]["score"], 0)


class Training(unittest.TestCase):
    def test_refuses_to_train_on_too_little_data(self):
        d = Dataset(np.zeros((6, 2)), np.array([1, 0, 0, 0, 0, 0]), np.ones(6), np.array(["a"] * 6), list("abcdef"))
        with self.assertRaises(SystemExit) as cm:
            train("unit-test", d, ["a", "b"])
        self.assertIn(str(MIN_PER_CLASS), str(cm.exception))


if __name__ == "__main__":
    unittest.main()
