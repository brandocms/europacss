use europacss::{load_config, load_config_tracked, resolve_config, studio};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Project(PathBuf);
impl Project {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "europa-config-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        Self(root.canonicalize().unwrap())
    }
    fn write(&self, name: &str, source: &str) {
        let path = self.0.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, source).unwrap();
    }
    fn load(&self) -> Result<serde_json::Value, String> {
        load_config(&self.0.join("europa.json5"))
    }
}
impl Drop for Project {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn chains_merge_raw_data_before_defaults_extensions_and_references() {
    let p = Project::new();
    p.write("defaults.json", &json!({
        "dpxViewportSizes":{"xs":320,"lg":1440},
        "nullable":{"value":true}, "replaced":[1,2],
        "theme":{
            "colors":{"ink":"#111111","accent":"blue"},
            "border":"1px solid {colors.ink}",
            "typography":{
                "families":{"main":["Base","serif"],"mono":["Mono","monospace"]},
                "sizes":{"hero":{"__base__":{"font-family":"{typography.families.main}","color":"{colors.ink}"},"xs":"20px","lg":"40px"}}
            },
            "extend":{"colors":{"extended":"pink"}}
        }
    }).to_string());
    p.write("presets/brando.json5", "{extends:'../defaults.json',theme:{colors:{background:'white'},extend:{colors:{extra:'gold'}}}}");
    p.write("europa.json5", "{extends:'./presets/brando.json5', dpxViewportSizes:{lg:1600}, nullable:null, replaced:[], theme:{colors:{ink:'red'}, typography:{families:{main:['Child','sans-serif']},sizes:{hero:{lg:'48px'}}},extend:{colors:{extended:'green'}}}}");
    let config = p.load().unwrap();
    assert!(config.get("extends").is_none());
    assert_eq!(config["dpxViewportSizes"], json!({"xs":320,"lg":1600}));
    assert_eq!(config["nullable"], json!(null));
    assert_eq!(config["replaced"], json!([]));
    assert_eq!(
        config["theme"]["colors"],
        json!({"ink":"red","accent":"blue","background":"white","extended":"green","extra":"gold"})
    );
    assert_eq!(config["theme"]["border"], "1px solid red");
    let typography = &config["theme"]["typography"];
    assert_eq!(typography["families"]["mono"], json!(["Mono", "monospace"]));
    assert_eq!(typography["sizes"]["hero"]["xs"], "20px");
    assert_eq!(typography["sizes"]["hero"]["lg"], "48px");
    assert_eq!(
        typography["sizes"]["hero"]["__base__"]["font-family"],
        json!(["Child", "sans-serif"])
    );
    assert_eq!(typography["sizes"]["hero"]["__base__"]["color"], "red");
    // Inheritance does not recursively merge the built-in typography defaults.
    assert!(typography.get("base").is_none());
    assert_eq!(config["dpxViewportSize"], 1440);
    assert_eq!(
        config["theme"]["colors"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["ink", "accent", "background", "extended", "extra"]
    );
}

#[test]
fn child_type_replacements_and_final_theme_extend_keep_existing_semantics() {
    let p = Project::new();
    // This reference is intentionally unresolved until the child supplies it.
    p.write("base.json5", "{option:{nested:true},theme:{colors:{ink:'{colors.child}'},spacing:{gap:{xs:'10px',lg:'20px'}},extend:{colors:{child:'green'}}}}");
    p.write(
        "europa.json5",
        "{extends:'base.json5',option:false,theme:{colors:{child:'red'},spacing:{gap:'12px'}}}",
    );
    let config = p.load().unwrap();
    assert_eq!(config["option"], false);
    assert_eq!(config["theme"]["spacing"]["gap"], "12px");
    assert_eq!(config["theme"]["colors"]["ink"], "green");
    p.write(
        "europa.json5",
        "{extends:'base.json5',theme:{extend:{colors:{child:'red'}}}}",
    );
    assert_eq!(p.load().unwrap()["theme"]["colors"]["ink"], "red");
}

#[test]
fn invalid_parents_cycles_and_reference_errors_name_the_files() {
    let p = Project::new();
    for bad in ["null", "true", "[]", "['base.json5']", "''", "42"] {
        p.write("europa.json5", &format!("{{extends:{bad}}}"));
        let error = p.load().unwrap_err();
        assert!(
            error.contains("europa.json5") && error.contains("extends must be"),
            "{error}"
        );
    }
    p.write("europa.json5", "{extends:'base.json'}");
    for invalid in ["{theme:{}}", "[]", "{\"theme\":{},\"theme\":{}}"] {
        p.write("base.json", invalid);
        let error = p.load().unwrap_err();
        assert!(
            error.contains("base.json") && error.contains("europa.json5"),
            "{error}"
        );
    }
    p.write("europa.json5", "{extends:'base.json5'}");
    p.write("base.json5", "{extends:'./europa.json5'}");
    assert!(p.load().unwrap_err().contains("Cyclic config inheritance"));
    p.write(
        "base.json5",
        "{theme:{colors:{a:'{colors.b}',b:'{colors.a}'}}}",
    );
    assert!(p.load().unwrap_err().contains("Cyclic token reference"));
    p.write("base.json5", "{theme:{colors:{a:'{colors.missing}'}}}");
    assert!(p.load().unwrap_err().contains("Unknown token reference"));
    p.write("europa.json5", "{extends:'base.js'}");
    p.write("base.js", "module.exports = {};");
    assert!(p
        .load()
        .unwrap_err()
        .contains("JavaScript configuration must be migrated"));
    assert!(resolve_config(json!({"extends":"base.json5"}))
        .unwrap_err()
        .message
        .contains("load_config"));
}

#[test]
fn tracked_files_include_missing_parents_and_detect_restored_timestamps() {
    let p = Project::new();
    p.write("europa.json5", "{extends:'preset/base.json5'}");
    let mut watched = Vec::new();
    assert!(load_config_tracked(&p.0.join("europa.json5"), &mut watched).is_err());
    assert!(watched.contains(&p.0.join("preset/base.json5")));
    p.write("preset/base.json5", "{theme:{colors:{brand:'red'}}}");
    let loaded = load_config_tracked(&p.0.join("europa.json5"), &mut Vec::new()).unwrap();
    assert_eq!(
        loaded.dependencies,
        [p.0.join("europa.json5"), p.0.join("preset/base.json5")]
    );
    assert!(loaded.watch.iter().all(|snapshot| !snapshot.changed()));
    let parent = p.0.join("preset/base.json5");
    let modified = fs::metadata(&parent).unwrap().modified().unwrap();
    p.write("preset/base.json5", "{theme:{colors:{brand:'tan'}}}");
    fs::File::options()
        .write(true)
        .open(&parent)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    assert!(loaded.watch.iter().any(|snapshot| snapshot.changed()));
    assert_eq!(p.load().unwrap()["theme"]["colors"]["brand"], "tan");
}

#[cfg(unix)]
#[test]
fn symlinks_use_physical_parent_paths_detect_cycles_and_retargeting() {
    use std::os::unix::fs::symlink;
    let p = Project::new();
    p.write("physical/base.json5", "{extends:'colors.json'}");
    p.write(
        "physical/colors.json",
        "{\"theme\":{\"colors\":{\"brand\":\"red\"}}}",
    );
    p.write("other.json5", "{theme:{colors:{brand:'tan'}}}");
    symlink("physical/base.json5", p.0.join("alias.json5")).unwrap();
    p.write("europa.json5", "{extends:'alias.json5'}");
    let mut watched = Vec::new();
    let loaded = load_config_tracked(&p.0.join("europa.json5"), &mut watched).unwrap();
    assert_eq!(loaded.value["theme"]["colors"]["brand"], "red");
    assert!(watched.contains(&p.0.join("alias.json5")));
    assert!(watched.contains(&p.0.join("physical/base.json5")));
    fs::remove_file(p.0.join("alias.json5")).unwrap();
    symlink("other.json5", p.0.join("alias.json5")).unwrap();
    assert!(loaded.watch.iter().any(|snapshot| snapshot.changed()));
    assert_eq!(p.load().unwrap()["theme"]["colors"]["brand"], "tan");
    p.write("other.json5", "{extends:'alias.json5'}");
    assert!(p.load().unwrap_err().contains("Cyclic config inheritance"));
}

#[test]
fn inheritance_chains_have_a_bounded_depth() {
    let p = Project::new();
    p.write("europa.json5", "{extends:'0.json5'}");
    for i in 0..64 {
        p.write(
            &format!("{i}.json5"),
            &format!("{{extends:'{}.json5'}}", i + 1),
        );
    }
    p.write("64.json5", "{}");
    assert!(p.load().unwrap_err().contains("inheritance limit exceeded"));
}

#[test]
fn oversized_config_sources_fail_before_parsing() {
    let p = Project::new();
    p.write("europa.json5", "{extends:'large.json5'}");
    p.write("large.json5", &" ".repeat(8 * 1024 * 1024));
    let error = p.load().unwrap_err();
    assert!(
        error.contains("large.json5") && error.contains("size limit exceeded"),
        "{error}"
    );
}

#[test]
fn studio_previews_local_edits_without_flattening_or_following_browser_paths() {
    let p = Project::new();
    p.write(
        "base.json5",
        "{theme:{typography:{sizes:{body:{'*':'20px'}}},spacing:{gap:{'*':'12px'}}}}",
    );
    let source = "{extends:'base.json5',theme:{typography:{sizes:{body:{'*':'24px'}}}}}";
    p.write("europa.json5", source);
    let context = studio::ConfigContext::new(source, Some(&p.0.join("europa.json5"))).unwrap();
    let preview = context.preview(source).unwrap();
    assert!(preview
        .specimens
        .iter()
        .find(|s| s.name == "body")
        .unwrap()
        .css
        .contains("24px"));
    assert!(preview
        .specimens
        .iter()
        .find(|s| s.name == "gap")
        .unwrap()
        .config_paths
        .is_empty());
    let preview = context.preview("{extends:'base.json5'}").unwrap();
    assert!(preview
        .specimens
        .iter()
        .find(|s| s.name == "body")
        .unwrap()
        .css
        .contains("20px"));
    assert!(preview.notes.iter().any(|n| n.contains("startup")));
    assert!(context
        .preview("{extends:'other.json5'}")
        .err()
        .unwrap()
        .contains("restarting"));
    assert!(context.preview("{}").err().unwrap().contains("restarting"));
    assert_eq!(
        fs::read_to_string(p.0.join("europa.json5")).unwrap(),
        source
    );
}
