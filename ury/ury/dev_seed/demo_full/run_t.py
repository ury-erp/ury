import unittest, io
def run():
    from ury.ury.api import test_ury_kot_display_serve_and_list as m
    s = unittest.TestSuite()
    for name in ("TestAttachItemStates",):
        s.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(getattr(m, name)))
    buf = io.StringIO(); r = unittest.TextTestRunner(stream=buf, verbosity=2).run(s)
    print(buf.getvalue()[-900:]); print("ran", r.testsRun, "fail", len(r.failures), "err", len(r.errors))
