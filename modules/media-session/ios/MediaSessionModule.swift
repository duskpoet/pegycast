import ExpoModulesCore
import MediaPlayer

public class MediaSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaSession")

    Events("onMediaCommand")

    OnCreate {
      self.setupRemoteCommands()
    }

    Function("updateNowPlaying") { (info: [String: Any]) in
      DispatchQueue.main.async {
        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = info["title"] as? String ?? ""
        nowPlayingInfo[MPMediaItemPropertyArtist] = info["artist"] as? String ?? ""
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = info["duration"] as? Double ?? 0
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = info["position"] as? Double ?? 0
        let isPlaying = info["isPlaying"] as? Bool ?? false
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0

        if let artworkUrl = info["artwork"] as? String, let url = URL(string: artworkUrl) {
          self.loadArtwork(from: url) { image in
            if let image = image {
              let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
              nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
          }
        } else {
          MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
      }
    }

    Function("updatePlaybackState") { (isPlaying: Bool, position: Double) in
      DispatchQueue.main.async {
        if var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo {
          nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
          nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
          MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
      }
    }

    Function("clearNowPlaying") {
      DispatchQueue.main.async {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      }
    }
  }

  private func setupRemoteCommands() {
    let commandCenter = MPRemoteCommandCenter.shared()

    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "play"])
      return .success
    }

    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "pause"])
      return .success
    }

    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "togglePlayPause"])
      return .success
    }

    commandCenter.stopCommand.isEnabled = true
    commandCenter.stopCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "stop"])
      return .success
    }

    commandCenter.skipForwardCommand.isEnabled = true
    commandCenter.skipForwardCommand.preferredIntervals = [30]
    commandCenter.skipForwardCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "skipForward"])
      return .success
    }

    commandCenter.skipBackwardCommand.isEnabled = true
    commandCenter.skipBackwardCommand.preferredIntervals = [15]
    commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
      self?.sendEvent("onMediaCommand", ["command": "skipBackward"])
      return .success
    }

    commandCenter.changePlaybackPositionCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      if let event = event as? MPChangePlaybackPositionCommandEvent {
        self?.sendEvent("onMediaCommand", ["command": "seek", "seekTime": event.positionTime])
      }
      return .success
    }
  }

  private func loadArtwork(from url: URL, completion: @escaping (UIImage?) -> Void) {
    URLSession.shared.dataTask(with: url) { data, _, _ in
      if let data = data, let image = UIImage(data: data) {
        DispatchQueue.main.async { completion(image) }
      } else {
        DispatchQueue.main.async { completion(nil) }
      }
    }.resume()
  }
}