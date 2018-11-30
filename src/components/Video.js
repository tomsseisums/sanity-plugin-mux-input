import React, {Component} from 'react'
import PropTypes from 'prop-types'
import Hls from 'hls.js'
import ProgressBar from 'part:@sanity/components/progress/bar'

import {getAsset} from '../actions/assets'
import getPosterSrc from '../util/getPosterSrc'

import styles from './Video.css'

const NOOP = () => {}

const propTypes = {
  assetDocument: PropTypes.object.isRequired,
  autoload: PropTypes.bool
}

class MuxVideo extends Component {
  state = {
    posterUrl: null,
    source: null,
    isLoading: true,
    error: null,
    isDeletedOnMux: false
  }

  static defaultProps = {
    autoload: true
  }

  videoContainer = React.createRef()
  posterContainer = React.createRef()
  hls = null

  // eslint-disable-next-line complexity
  static getDerivedStateFromProps(nextProps) {
    let source = null
    let posterUrl = null
    let isLoading = true
    const {assetDocument} = nextProps
    if (assetDocument && assetDocument.status === 'preparing') {
      isLoading = 'MUX is processing the video'
    }
    if (assetDocument && assetDocument.status === 'ready') {
      isLoading = false
    }
    if (assetDocument && assetDocument.playbackId) {
      source = `https://stream.mux.com/${assetDocument.playbackId}.m3u8`
      posterUrl = getPosterSrc(assetDocument.playbackId, {
        time: assetDocument.thumbTime || 1,
        fitMode: 'preserve'
      })
    }
    if (assetDocument && typeof assetDocument.status === 'undefined') {
      isLoading = false
    }
    return {isLoading, source, posterUrl}
  }

  componentDidMount() {
    this.video = React.createRef()
    this.setState(MuxVideo.getDerivedStateFromProps(this.props))
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.source !== null && this.video.current && !this.video.current.src) {
      this.setState({error: null})
      this.attachVideo()
    }
    if (this.state.source !== null && this.state.source !== prevState.source) {
      this.setState({error: null, showControls: false})
      this.hls.destroy()
      this.attachVideo()
    }
  }

  getVideoElement() {
    return this.video && this.video.current
  }

  attachVideo() {
    const {assetDocument, autoload} = this.props
    if (Hls.isSupported()) {
      this.hls = new Hls({autoStartLoad: autoload})
      this.hls.loadSource(this.state.source)
      this.hls.attachMedia(this.video.current)
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.videoContainer.current) {
          this.videoContainer.current.style.display = 'block'
        }
        if (this.props.onReady) {
          this.props.onReady()
        }
      })
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            this.videoContainer.current.style.display = 'none'
            this.setState({error: data})
            getAsset(assetDocument.assetId)
              .then(response => {
                this.setState({isDeletedOnMux: false})
              })
              .catch(err => {
                if (err.message.match(/404/)) {
                  this.setState({isDeletedOnMux: true})
                  return
                }
                console.error(data, err) // eslint-disable-line no-console
              })
            break
          default:
            console.error(data) // eslint-disable-line no-console
        }
      })
    } else if (this.video.current.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.current.src = this.state.source
      this.video.current.addEventListener('loadedmetadata', () => {
        this.hls.loadSource(this.state.source)
        this.hls.attachMedia(this.video.current)
      })
    }
  }

  handleVideoClick = event => {
    this.setState({showControls: true})
    this.hls.startLoad(0)
    if (this.props.onReady) {
      this.props.onReady()
    }
  }

  render() {
    const {posterUrl, isLoading, error} = this.state
    const {assetDocument, autoload} = this.props
    if (!assetDocument || !assetDocument.status) {
      return null
    }

    if (isLoading) {
      return (
        <div className={styles.progressBar}>
          <ProgressBar
            percent={100}
            text="Waiting for MUX to complete the file"
            isInProgress={true}
            showPercent
            animation
            color="primary"
          />
        </div>
      )
    }

    const showControls = autoload || this.state.showControls
    return (
      <div>
        <div ref={this.videoContainer} className={styles.videoContainer}>
          <video
            className={styles.root}
            onClick={autoload ? NOOP : this.handleVideoClick}
            controls={showControls}
            ref={this.video}
            poster={posterUrl}
          />
        </div>
        {error && (
          <div className={[styles.videoContainer, styles.videoError].join(' ')}>
            <p>
              There was an error loading this video ({error.type}
              ).
            </p>
            {this.state.isDeletedOnMux && (
              <p>
                <strong>The video is deleted on MUX.com</strong>
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
}

MuxVideo.propTypes = propTypes

export default MuxVideo
